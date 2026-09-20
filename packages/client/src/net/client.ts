import { io, type Socket } from 'socket.io-client';
import type {
  Action,
  ClientToServerEvents,
  GameEvent,
  PlayerId,
  PlayerView,
  Reply,
  RoomConfig,
  RoomView,
  ServerToClientEvents,
  Session,
  Value,
} from '@trio/shared';
import { closedText, errorText } from '../text';
import { loadSession, saveSession } from './storage';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

export interface State {
  connection: 'connecting' | 'online' | 'offline';
  session: Session | null;
  room: RoomView | null;
  game: PlayerView | null;
  /** Eventos del último cambio: solo para efectos pasajeros, nunca para recordar cartas. */
  events: GameEvent[];
  /** Cambia con cada actualización, para que los efectos se disparen aunque repitan eventos. */
  tick: number;
  /** Carta que acaba de darte tu compañero, deducida de tu propia mano. */
  received: Value | null;
  notice: string | null;
}

const ACK_TIMEOUT_MS = 8_000;

let state: State = {
  connection: 'connecting',
  session: loadSession(),
  room: null,
  game: null,
  events: [],
  tick: 0,
  received: null,
  notice: null,
};

const listeners = new Set<() => void>();
let socket: Client | null = null;

export const getState = (): State => state;

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

function set(patch: Partial<State>): void {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

/** Abre la conexión. Se llama una vez al arrancar la aplicación. */
export function connect(): void {
  if (socket) return;
  socket = io({ transports: ['websocket', 'polling'] });

  socket.on('connect', () => {
    set({ connection: 'online' });
    if (state.session) void resume(state.session);
  });
  socket.on('disconnect', () => set({ connection: 'offline' }));
  socket.io.on('reconnect_attempt', () => set({ connection: 'connecting' }));

  socket.on('room:state', (room) => set({ room, game: room.status === 'lobby' ? null : state.game }));
  socket.on('game:view', ({ view, events }) =>
    set({ game: view, events, tick: state.tick + 1, received: receivedCard(state, view, events) }),
  );
  socket.on('room:closed', (reason) => {
    saveSession(null);
    set({ session: null, room: null, game: null, received: null, notice: closedText(reason) });
  });
}

/**
 * Qué carta te ha dado tu compañero. Se deduce comparando tu propia mano, que
 * ya conoces entera: no hace falta que el servidor lo cuente, y así los rivales
 * siguen sin enterarse de nada.
 */
function receivedCard(before: State, after: PlayerView, events: GameEvent[]): Value | null {
  if (events.some((e) => e.type === 'swapRequested')) return null; // ronda nueva: se olvida
  const team = after.players.find((p) => p.id === after.me)?.team ?? null;
  const mine = events.some((e) => e.type === 'swapResolved' && e.team === team && e.swapped);
  if (!mine || !before.game) return before.received;

  const counts = new Map<Value, number>();
  for (const card of before.game.myHand) counts.set(card.value, (counts.get(card.value) ?? 0) + 1);
  for (const card of after.myHand) {
    const left = counts.get(card.value) ?? 0;
    if (left === 0) return card.value;
    counts.set(card.value, left - 1);
  }
  return null;
}

/** Envía y espera respuesta; un fallo de red se cuenta como error. */
async function ask<T extends object>(run: (s: Client) => Promise<Reply<T>>): Promise<Reply<T>> {
  if (!socket) return { ok: false, error: 'BAD_REQUEST' };
  try {
    return await run(socket);
  } catch {
    return { ok: false, error: 'BAD_REQUEST' };
  }
}

/** Para las acciones sin respuesta útil: devuelve el texto del error, o null. */
async function command<T extends object>(run: (s: Client) => Promise<Reply<T>>): Promise<string | null> {
  const reply = await ask(run);
  if (reply.ok) return null;
  const text = errorText(reply.error);
  set({ notice: text });
  return text;
}

function entered(reply: Reply<Session>): string | null {
  if (!reply.ok) return errorText(reply.error);
  const session: Session = { code: reply.code, playerId: reply.playerId, token: reply.token };
  saveSession(session);
  set({ session, notice: null });
  return null;
}

const withTimeout = (s: Client) => s.timeout(ACK_TIMEOUT_MS);

export const createRoom = async (name: string): Promise<string | null> =>
  entered(await ask((s) => withTimeout(s).emitWithAck('room:create', { name })));

export const joinRoom = async (code: string, name: string): Promise<string | null> =>
  entered(await ask((s) => withTimeout(s).emitWithAck('room:join', { code, name })));

/** Vuelve al asiento tras recargar o perder la conexión. */
async function resume(session: Session): Promise<void> {
  const reply = await ask((s) => withTimeout(s).emitWithAck('room:resume', session));
  if (reply.ok || !socket?.connected) return;
  saveSession(null);
  set({ session: null, room: null, game: null, notice: 'Esa partida ya no existe.' });
}

export const configure = (patch: Partial<RoomConfig>): Promise<string | null> =>
  command((s) => withTimeout(s).emitWithAck('room:config', patch));

export const chooseTeam = (team: number | null): Promise<string | null> =>
  command((s) => withTimeout(s).emitWithAck('room:team', { team }));

export const kick = (playerId: PlayerId): Promise<string | null> =>
  command((s) => withTimeout(s).emitWithAck('room:kick', { playerId }));

export const addBot = (): Promise<string | null> =>
  command((s) => withTimeout(s).emitWithAck('room:addBot'));

/** Que un bot juegue ya por alguien que se ha caído. */
export const substitute = (playerId: PlayerId): Promise<string | null> =>
  command((s) => withTimeout(s).emitWithAck('room:substitute', { playerId }));

export const startGame = (): Promise<string | null> =>
  command((s) => withTimeout(s).emitWithAck('game:start'));

export const act = (action: Action): Promise<string | null> =>
  command((s) => withTimeout(s).emitWithAck('game:action', action));

export const backToLobby = (): Promise<string | null> =>
  command((s) => withTimeout(s).emitWithAck('game:reset'));

export async function leaveRoom(): Promise<void> {
  await ask((s) => withTimeout(s).emitWithAck('room:leave'));
  saveSession(null);
  set({ session: null, room: null, game: null, received: null, notice: null });
}

export const dismissNotice = (): void => set({ notice: null });
