import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { io as connect, type Socket } from 'socket.io-client';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  mulberry32,
  type Action,
  type ClientToServerEvents,
  type GameUpdate,
  type PlayerView,
  type Reply,
  type RoomView,
  type ServerToClientEvents,
  type Session,
} from '@trio/shared';
import { createApp, type App } from './app';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

interface Player {
  socket: Client;
  /** Todo lo que ha llegado por el socket, tal cual. */
  wire: string[];
  room: RoomView | null;
  view: PlayerView | null;
  /** Vistas de partida recibidas: cada cambio de la partida manda exactamente una. */
  updates: number;
  closed: string[];
}

let app: App;
let url: string;
let clientDir: string;
const players: Player[] = [];

beforeAll(async () => {
  clientDir = mkdtempSync(join(tmpdir(), 'trio-client-'));
  writeFileSync(join(clientDir, 'index.html'), '<!doctype html><title>Trio</title>');
  app = createApp({ clientDir, rng: mulberry32(42) });
  await new Promise<void>((done) => app.http.listen(0, '127.0.0.1', done));
  url = `http://127.0.0.1:${(app.http.address() as AddressInfo).port}`;
});

afterEach(() => {
  for (const p of players.splice(0)) p.socket.disconnect();
});

afterAll(async () => {
  await app.close();
  rmSync(clientDir, { recursive: true, force: true });
});

async function player(): Promise<Player> {
  const socket: Client = connect(url, { transports: ['websocket'], forceNew: true, reconnection: false });
  const p: Player = { socket, wire: [], room: null, view: null, updates: 0, closed: [] };
  socket.onAny((event: string, ...args: unknown[]) => p.wire.push(`${event} ${JSON.stringify(args)}`));
  socket.on('room:state', (room) => (p.room = room));
  socket.on('game:view', (update: GameUpdate) => {
    p.view = update.view;
    p.updates++;
  });
  socket.on('room:closed', (reason) => p.closed.push(reason));
  await new Promise<void>((done) => socket.once('connect', done));
  players.push(p);
  return p;
}

/** Para comprobar que algo NO llega: se da margen a que llegara. */
const settle = () => new Promise((done) => setTimeout(done, 30));

async function waitFor(condition: () => boolean, what: string): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`Sin respuesta: ${what}`);
    await new Promise((done) => setTimeout(done, 1));
  }
}

/** Espera a que todos hayan recibido la vista producida por el último cambio. */
const synced = (all: Player[], updates: number) =>
  waitFor(() => all.every((p) => p.updates >= updates), `${updates} vistas`);

async function ok<T extends object>(reply: Promise<Reply<T>>): Promise<T> {
  const r = await reply;
  if (!r.ok) throw new Error(`Rechazado: ${r.error}`);
  return r;
}

async function tableOf(n: number): Promise<{ host: Player; all: Player[]; sessions: Session[] }> {
  const host = await player();
  const first = await ok(host.socket.emitWithAck('room:create', { name: 'Ana' }));
  const all = [host];
  const sessions: Session[] = [first];
  for (let i = 1; i < n; i++) {
    const p = await player();
    sessions.push(await ok(p.socket.emitWithAck('room:join', { code: first.code.toLowerCase(), name: `J${i}` })));
    all.push(p);
  }
  await waitFor(() => all.every((p) => p.room?.members.length === n), 'sala completa');
  return { host, all, sessions };
}

/** Lo que haría la interfaz: elegir una acción entre las que anuncia la vista. */
function someLegalAction(view: PlayerView, step: number): Action | null {
  const { legal } = view;
  if (legal.confirm) return { type: 'CONFIRM_RETURN' };
  if (legal.swap) return step % 2 ? { type: 'SWAP_PASS' } : { type: 'SWAP_CHOOSE', handIndex: 0 };
  if (!legal.reveal) return null;
  const { centerSlots, targets } = legal.reveal;
  const options: Action[] = [
    ...centerSlots.map((slot): Action => ({ type: 'REVEAL_CENTER', slot })),
    ...targets.flatMap((targetId): Action[] => [
      { type: 'REVEAL_PLAYER', targetId, end: 'lowest' },
      { type: 'REVEAL_PLAYER', targetId, end: 'highest' },
    ]),
  ];
  return options[(step * 7) % options.length] ?? null;
}

/** Comprueba en cada vista recibida que ninguna carta oculta viaja con su valor. */
function assertRedacted(view: PlayerView): void {
  for (const p of view.players) {
    for (const slot of p.hand) if (!slot.faceUp) expect(slot).toEqual({ faceUp: false });
  }
  for (const slot of view.center) if (slot.state !== 'up') expect(slot).not.toHaveProperty('value');
  expect(view.myHand).toHaveLength(view.players.find((p) => p.id === view.me)?.hand.length ?? -1);
  // El registro no hace de chuleta: solo lleva el valor de lo que sigue boca arriba.
  const shown = view.log.flatMap((e) => (e.type === 'reveal' && 'value' in e ? [e.value] : []));
  expect(shown).toEqual(view.revealed.map((r) => r.value));
}

describe('servidor de extremo a extremo', () => {
  it('crear, unirse, jugar: por el cable no viaja ni una carta oculta ni un token ajeno', async () => {
    const { host, all, sessions } = await tableOf(3);
    expect(host.room?.members.map((m) => m.name)).toEqual(['Ana', 'J1', 'J2']);
    expect(all.every((p) => p.room?.status === 'lobby')).toBe(true);

    await ok(host.socket.emitWithAck('game:start'));
    await synced(all, 1);

    let steps = 0;
    for (; steps < 400; steps++) {
      const mover = all.find((p) => p.view && someLegalAction(p.view, steps));
      if (!mover?.view) break;
      await ok(mover.socket.emitWithAck('game:action', someLegalAction(mover.view, steps) as Action));
      await synced(all, steps + 2);
    }
    expect(steps).toBeGreaterThan(20);

    const views = all.flatMap((p) =>
      p.wire.filter((w) => w.startsWith('game:view ')).map((w) => (JSON.parse(w.slice(10)) as [GameUpdate])[0]),
    );
    expect(views.length).toBeGreaterThan(steps);
    for (const update of views) assertRedacted(update.view);

    // Los tokens solo viajan en el ack de su dueño, nunca en un evento empujado.
    all.forEach((p) => {
      const pushed = p.wire.join('\n');
      for (const s of sessions) expect(pushed).not.toContain(s.token);
    });

    // El estado completo del motor tampoco sale nunca.
    for (const p of all) expect(p.wire.join('\n')).not.toMatch(/"cards"|"hands"|"token"/);
  });

  it('recargar a media partida recupera el asiento y la mano', async () => {
    const { host, all, sessions } = await tableOf(3);
    await ok(host.socket.emitWithAck('game:start'));
    await synced(all, 1);
    const guest = all[1] as Player;
    const handBefore = guest.view?.myHand;
    expect(handBefore).toHaveLength(9);
    guest.socket.disconnect();
    await waitFor(() => host.room?.members[1]?.connected === false, 'desconexión');

    const again = await player();
    const session = sessions[1] as Session;
    const resumed = await ok(again.socket.emitWithAck('room:resume', { code: session.code, token: session.token }));
    await waitFor(() => host.room?.members[1]?.connected === true, 'reconexión');
    expect(resumed.playerId).toBe(session.playerId);
    expect(again.view?.me).toBe(session.playerId);
    expect(again.view?.myHand).toEqual(handBefore);
    expect(host.room?.members[1]?.connected).toBe(true);
  });

  it('el token de otro no sirve, ni un código inventado', async () => {
    const { sessions } = await tableOf(3);
    const intruder = await player();
    const code = (sessions[0] as Session).code;
    expect(await intruder.socket.emitWithAck('room:resume', { code, token: 'x'.repeat(32) })).toEqual({
      ok: false,
      error: 'INVALID_TOKEN',
    });
    expect(await intruder.socket.emitWithAck('room:join', { code: 'ZZZZ', name: 'Eve' })).toEqual({
      ok: false,
      error: 'ROOM_NOT_FOUND',
    });
    expect(await intruder.socket.emitWithAck('game:action', { type: 'CONFIRM_RETURN' })).toEqual({
      ok: false,
      error: 'NOT_IN_ROOM',
    });
  });

  it('las peticiones malformadas se rechazan sin tumbar nada', async () => {
    const p = await player();
    const raw = p.socket as unknown as Socket;
    expect(await raw.emitWithAck('room:create', null)).toEqual({ ok: false, error: 'INVALID_NAME' });
    expect(await raw.emitWithAck('room:create', { name: '   ' })).toEqual({ ok: false, error: 'INVALID_NAME' });
    expect(await raw.emitWithAck('room:create', { name: 'x'.repeat(21) })).toEqual({
      ok: false,
      error: 'INVALID_NAME',
    });
    expect(await raw.emitWithAck('room:join', { code: 42, name: 'Eve' })).toEqual({
      ok: false,
      error: 'ROOM_NOT_FOUND',
    });
    // Sin ack no hay respuesta, pero el servidor sigue vivo.
    raw.emit('room:create', { name: 'Sin ack' });
    await ok(p.socket.emitWithAck('room:create', { name: 'Ana' }));
    expect(await raw.emitWithAck('game:action', 'basura')).toEqual({ ok: false, error: 'NOT_PLAYING' });
  });

  it('el expulsado recibe el aviso y deja de recibir la partida', async () => {
    const { host, all, sessions } = await tableOf(4);
    await ok(host.socket.emitWithAck('game:start'));
    await synced(all, 1);
    const victim = all[3] as Player;
    await ok(host.socket.emitWithAck('room:kick', { playerId: (sessions[3] as Session).playerId }));
    await waitFor(() => victim.closed.length > 0, 'aviso de expulsión');
    expect(victim.closed).toEqual(['kicked']);
    const before = victim.wire.length;

    // La partida sigue para los demás; al expulsado ya no le llega nada.
    await ok(host.socket.emitWithAck('game:reset'));
    await settle();
    expect(victim.wire.length).toBe(before);
    expect(host.room?.members).toHaveLength(3);
    expect(await victim.socket.emitWithAck('game:start')).toEqual({ ok: false, error: 'NOT_IN_ROOM' });
  });
});

describe('servidor HTTP', () => {
  const get = (path: string) =>
    new Promise<{ status: number; body: string; headers: Record<string, unknown> }>((done, reject) => {
      const req = request(`${url}${path}`, (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => done({ status: res.statusCode ?? 0, body, headers: res.headers }));
      });
      req.on('error', reject);
      req.end();
    });

  it('responde al chequeo de salud', async () => {
    expect(await get('/healthz')).toMatchObject({ status: 200, body: 'ok' });
  });

  it('sirve el cliente y cae en index.html para las rutas de la app', async () => {
    const home = await get('/');
    expect(home.status).toBe(200);
    expect(home.body).toContain('<title>Trio</title>');
    expect(home.headers['x-content-type-options']).toBe('nosniff');
    expect((await get('/sala/ABCD')).body).toContain('<title>Trio</title>');
    expect((await get('/assets/falta.js')).status).toBe(404);
  });

  it('no deja salir de la carpeta del cliente', async () => {
    for (const path of ['/%2e%2e/package.json', '/..%2f..%2fpackage.json', '/%2e%2e%2f%2e%2e%2fetc/passwd']) {
      const res = await get(path);
      expect(res.status, path).toBe(404);
      expect(res.body).not.toContain('"name"');
    }
  });
});
