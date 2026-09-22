import { createServer, type Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import type {
  Action,
  ClientToServerEvents,
  PlayerId,
  Reply,
  Rng,
  ServerToClientEvents,
  Session,
} from '@trio/shared';
import { RoomRegistry, type Failure, type Member, type Room, type RoomListener } from './rooms';
import { normalizeCode, normalizeName } from './session';
import { staticHandler } from './static';

interface SocketData {
  session?: { code: string; playerId: PlayerId };
}

type Io = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
type IoSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

export interface AppOptions {
  /** Carpeta del cliente compilado; null para servir solo los sockets. */
  clientDir?: string | null;
  rng?: Rng;
  ttlMs?: number;
  sweepEveryMs?: number;
}

export interface App {
  http: HttpServer;
  io: Io;
  rooms: RoomRegistry;
  close(): Promise<void>;
}

/** Canal de Socket.IO de un jugador: todas sus pestañas reciben su vista. */
const channel = (code: string, playerId: PlayerId) => `${code}:${playerId}`;

const TOKEN_MAX_LENGTH = 64;

export function createApp(opts: AppOptions = {}): App {
  const handleStatic = staticHandler(opts.clientDir ?? null);
  const http = createServer((req, res) => void handleStatic(req, res));
  const io: Io = new Server(http, { serveClient: false, maxHttpBufferSize: 10_000 });

  const listener: RoomListener = {
    changed(room, events) {
      for (const m of room.members) {
        if (m.gone || m.connections === 0) continue;
        const to = io.to(channel(room.code, m.id));
        to.emit('room:state', room.viewFor(m.id));
        const update = events && room.gameUpdate(m.id, events);
        if (update) to.emit('game:view', update);
      }
    },
    removed(room, member, reason) {
      for (const socket of io.of('/').sockets.values()) {
        const s = socket.data.session;
        if (s?.code !== room.code || s.playerId !== member.id) continue;
        socket.data.session = undefined;
        void socket.leave(channel(room.code, member.id));
        socket.emit('room:closed', reason);
      }
    },
  };

  const rooms = new RoomRegistry({ listener, rng: opts.rng, ttlMs: opts.ttlMs });
  const sweeper = setInterval(() => rooms.sweep(), opts.sweepEveryMs ?? 60_000);

  io.on('connection', (socket: IoSocket) => {
    const unbind = () => {
      const s = socket.data.session;
      if (!s) return;
      socket.data.session = undefined;
      void socket.leave(channel(s.code, s.playerId));
      rooms.get(s.code)?.disconnect(s.playerId);
    };

    const bind = (room: Room, member: Member): Reply<Session> => {
      unbind();
      socket.data.session = { code: room.code, playerId: member.id };
      void socket.join(channel(room.code, member.id));
      room.connect(member.id);
      // Esta conexión necesita la foto completa aunque la sala no haya cambiado.
      socket.emit('room:state', room.viewFor(member.id));
      const update = room.gameUpdate(member.id, []);
      if (update) socket.emit('game:view', update);
      return { ok: true, code: room.code, playerId: member.id, token: member.token };
    };

    /** El asiento de esta conexión, si sigue siendo válido. */
    const seat = (): { room: Room; member: Member } | null => {
      const s = socket.data.session;
      const room = s && rooms.get(s.code);
      const member = s && room?.active(s.playerId);
      return room && member ? { room, member } : null;
    };

    /**
     * Registra un evento que viene de un cliente no fiable: sin ack no se
     * procesa, y un fallo inesperado responde BAD_REQUEST sin tumbar el servidor.
     */
    const on = (event: keyof ClientToServerEvents, withPayload: boolean, fn: (payload: unknown) => Reply) => {
      socket.on(event, (...args: unknown[]) => {
        const ack = args[withPayload ? 1 : 0];
        if (typeof ack !== 'function') return;
        let reply: Reply;
        try {
          reply = fn(withPayload ? args[0] : undefined);
        } catch (err) {
          console.error(`[${event}]`, err);
          reply = { ok: false, error: 'BAD_REQUEST' };
        }
        (ack as (r: Reply) => void)(reply);
      });
    };

    /** Igual que `on`, para acciones que exigen estar sentado en una sala. */
    const onSeated = (
      event: keyof ClientToServerEvents,
      withPayload: boolean,
      fn: (room: Room, member: Member, payload: unknown) => Failure | null,
    ) =>
      on(event, withPayload, (payload) => {
        const here = seat();
        if (!here) return fail('NOT_IN_ROOM');
        return result(fn(here.room, here.member, payload));
      });

    on('room:create', true, (req) => {
      const name = normalizeName(field(req, 'name'));
      if (!name) return fail('INVALID_NAME');
      const created = rooms.create(name);
      return typeof created === 'string' ? fail(created) : bind(created.room, created.host);
    });

    on('room:join', true, (req) => {
      const code = normalizeCode(field(req, 'code'));
      const room = code ? rooms.get(code) : undefined;
      if (!room) return fail('ROOM_NOT_FOUND');
      const name = normalizeName(field(req, 'name'));
      if (!name) return fail('INVALID_NAME');
      const member = room.join(name);
      return typeof member === 'string' ? fail(member) : bind(room, member);
    });

    on('room:resume', true, (req) => {
      const code = normalizeCode(field(req, 'code'));
      const room = code ? rooms.get(code) : undefined;
      if (!room) return fail('ROOM_NOT_FOUND');
      const token = field(req, 'token');
      const member =
        typeof token === 'string' && token.length <= TOKEN_MAX_LENGTH ? room.memberByToken(token) : undefined;
      return member ? bind(room, member) : fail('INVALID_TOKEN');
    });

    onSeated('room:leave', false, (room, me) => room.leave(me.id));
    onSeated('room:config', true, (room, me, req) =>
      room.configure(me.id, {
        mode: field(req, 'mode'),
        teams: field(req, 'teams'),
        idleSeconds: field(req, 'idleSeconds'),
        botLevel: field(req, 'botLevel'),
        botTakeoverSeconds: field(req, 'botTakeoverSeconds'),
      }),
    );
    onSeated('room:team', true, (room, me, req) => room.chooseTeam(me.id, field(req, 'team') ?? null));
    onSeated('room:kick', true, (room, me, req) => room.kick(me.id, field(req, 'playerId')));
    onSeated('room:addBot', false, (room, me) => room.addBot(me.id));
    onSeated('room:substitute', true, (room, me, req) => room.substitute(me.id, field(req, 'playerId')));
    onSeated('game:start', false, (room, me) => room.start(me.id));
    // El motor valida la forma de la acción: aquí no se interpreta nada.
    onSeated('game:action', true, (room, me, action) => room.act(me.id, action as Action));
    onSeated('game:reset', false, (room, me) => room.reset(me.id));

    socket.on('disconnect', unbind);
  });

  return {
    http,
    io,
    rooms,
    close: () =>
      new Promise<void>((done) => {
        clearInterval(sweeper);
        rooms.close();
        void io.close(() => done());
      }),
  };
}

function field(payload: unknown, key: string): unknown {
  return typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>)[key] : undefined;
}

const fail = (error: Failure): Reply => ({ ok: false, error });
const result = (error: Failure | null): Reply => (error ? fail(error) : { ok: true });
