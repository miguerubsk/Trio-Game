import type { BotLevel } from './bot';
import type { GameMode } from './cards';
import type { Action, ErrorCode, GameEvent, PlayerId } from './types';
import type { PlayerView } from './view';

/*
 * Contrato de Socket.IO entre servidor y cliente. Las peticiones del cliente
 * se responden siempre por el ack; el servidor empuja el estado con eventos.
 */

/** Sin O ni I: el código se dicta por teléfono sin dudas con 0 y 1. */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
export const ROOM_CODE_LENGTH = 4;
export const NAME_MAX_LENGTH = 20;
export const MAX_PLAYERS = 6;
/** Equipos posibles en la sala: parejas de hasta seis jugadores. */
export const MAX_TEAMS = MAX_PLAYERS / 2;
/** Salvaguarda de inactividad: cuánto espera el servidor antes de cerrar él una jugada. */
export const IDLE_SECONDS = { min: 30, max: 600, default: 90 } as const;
/** Cuánto aguanta una silla vacía antes de que juegue un bot. 0 = nunca. */
export const BOT_TAKEOVER_SECONDS = { min: 15, max: 600, default: 60, never: 0 } as const;

export interface RoomConfig {
  mode: GameMode;
  idleSeconds: number;
  /** Cuánta memoria tienen los bots de la sala. */
  botLevel: BotLevel;
  /** Segundos que se espera a un jugador caído antes de que juegue un bot; 0 = nunca. */
  botTakeoverSeconds: number;
}

export interface MemberView {
  id: PlayerId;
  name: string;
  connected: boolean;
  /** Se añadió como bot: no hay nadie detrás. */
  bot: boolean;
  /** Es una persona, pero ahora mismo juega un bot por ella. */
  playedByBot: boolean;
  /** Expulsado o marchado a mitad de partida: su mano sigue en la mesa y sus turnos se saltan. */
  gone: boolean;
  /** Equipo elegido en la sala; null = se asigna al empezar. */
  team: number | null;
}

export type StartBlocker = 'PLAYER_COUNT' | 'TEAMS_UNBALANCED';

export interface RoomView {
  code: string;
  me: PlayerId;
  hostId: PlayerId;
  status: 'lobby' | 'playing';
  config: RoomConfig;
  members: MemberView[];
  /** Por qué no se puede empezar todavía; null si se puede o si ya se está jugando. */
  startBlocker: StartBlocker | null;
  /** Instante (ms desde epoch) en que el servidor actuará solo si nadie lo hace antes. */
  autoActionAt: number | null;
}

export type RoomErrorCode =
  | 'BAD_REQUEST'
  | 'SERVER_FULL'
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'GAME_IN_PROGRESS'
  | 'INVALID_NAME'
  | 'NAME_TAKEN'
  | 'INVALID_TOKEN'
  | 'NOT_IN_ROOM'
  | 'NOT_HOST'
  | 'INVALID_CONFIG'
  | 'INVALID_TEAM'
  | 'TEAM_FULL'
  | 'INVALID_MEMBER'
  | 'CANNOT_START'
  | 'NOT_PLAYING';

export type Reply<T extends object = object> =
  | ({ ok: true } & T)
  | { ok: false; error: RoomErrorCode | ErrorCode };

export type ClosedReason = 'kicked' | 'left' | 'expired';

/** Lo que el cliente guarda para volver a su asiento tras recargar. */
export interface Session {
  code: string;
  playerId: PlayerId;
  /** Secreto del jugador: nunca se envía a nadie más. */
  token: string;
}

/**
 * La vista redactada y los eventos públicos que la han producido (vacíos al
 * reconectar). Los eventos son señales para animar, no para guardar: una
 * revelación lleva su valor porque en ese instante la carta está boca arriba.
 */
export interface GameUpdate {
  view: PlayerView;
  events: GameEvent[];
}

export type Ack<T extends object = object> = (reply: Reply<T>) => void;

export interface ClientToServerEvents {
  'room:create': (req: { name: string }, ack: Ack<Session>) => void;
  'room:join': (req: { code: string; name: string }, ack: Ack<Session>) => void;
  'room:resume': (req: { code: string; token: string }, ack: Ack<Session>) => void;
  'room:leave': (ack: Ack) => void;
  'room:config': (req: Partial<RoomConfig>, ack: Ack) => void;
  'room:team': (req: { team: number | null }, ack: Ack) => void;
  /** Expulsar; con un bot, lo quita de la sala. */
  'room:kick': (req: { playerId: PlayerId }, ack: Ack) => void;
  /** Añade un bot a la sala (anfitrión). */
  'room:addBot': (ack: Ack) => void;
  /** Que un bot juegue ya por alguien que se ha caído (anfitrión). */
  'room:substitute': (req: { playerId: PlayerId }, ack: Ack) => void;
  'game:start': (ack: Ack) => void;
  'game:action': (action: Action, ack: Ack) => void;
  /** Vuelve a la sala: al terminar, o para abandonar la partida en curso. */
  'game:reset': (ack: Ack) => void;
}

export interface ServerToClientEvents {
  'room:state': (room: RoomView) => void;
  'game:view': (update: GameUpdate) => void;
  /** Este jugador ya no pertenece a la sala (también llega a sus otras pestañas si se va). */
  'room:closed': (reason: ClosedReason) => void;
}
