import type { Card, GameMode, Value } from './cards';

export type PlayerId = string;
export type CardId = number;

export interface Player {
  id: PlayerId;
  name: string;
  /** Índice de equipo; null fuera del modo por equipos. */
  team: number | null;
}

export type Phase = 'awaitingReveal' | 'awaitingReturn' | 'teamSwap' | 'finished';
export type Outcome = 'trio' | 'mismatch';
export type End = 'lowest' | 'highest';

export type CardOrigin =
  | { kind: 'center'; slot: number }
  | { kind: 'hand'; playerId: PlayerId };

export interface RevealedCard {
  cardId: CardId;
  origin: CardOrigin;
}

/** Índice de la carta propia a entregar, o 'pass' para no intercambiar. */
export type SwapResponse = number | 'pass';

export interface SwapTeam {
  team: number;
  done: boolean;
  responses: Record<PlayerId, SwapResponse | null>;
}

export interface SwapState {
  reason: 'start' | 'trio';
  teams: SwapTeam[];
}

export interface Winner {
  playerIds: PlayerId[];
  team: number | null;
  /** Tres tríos (sencillo), dos tríos conectados (picante) o el trío de sietes. */
  reason: 'trios' | 'connected' | 'sevens';
}

export interface GameConfig {
  mode: GameMode;
  /** Variante por equipos: parejas enfrentadas, sin centro y con intercambios. */
  teams: boolean;
  targetTrios: number;
}

/**
 * Estado completo de la partida. Solo vive en el servidor: contiene el valor de
 * todas las cartas, así que nunca se serializa hacia un cliente (ver buildView).
 */
export interface GameState {
  config: GameConfig;
  /** Indexado por id de carta. Los ids se asignan tras barajar y no revelan el valor. */
  cards: Card[];
  /** En orden de asiento; en equipos los compañeros se sientan alternados. */
  players: Player[];
  /** Siempre ordenadas de menor a mayor valor. Las cartas reveladas siguen en su sitio. */
  hands: Record<PlayerId, CardId[]>;
  /** Huecos fijos: una carta que no casa vuelve a su hueco. null = ya retirada. */
  center: (CardId | null)[];
  /** Cartas boca arriba en el turno actual (0 a 3). Públicas. */
  revealed: RevealedCard[];
  /** Resultado de la jugada mientras se espera el «continuar» del jugador activo. */
  outcome: Outcome | null;
  trios: Record<PlayerId, Value[]>;
  phase: Phase;
  currentPlayerIndex: number;
  swap: SwapState | null;
  winner: Winner | null;
  log: GameEvent[];
}

export type Action =
  | { type: 'REVEAL_CENTER'; slot: number }
  | { type: 'REVEAL_PLAYER'; targetId: PlayerId; end: End }
  | { type: 'CONFIRM_RETURN' }
  | { type: 'SWAP_CHOOSE'; handIndex: number }
  | { type: 'SWAP_PASS' };

export type RevealFrom =
  | { kind: 'center'; slot: number }
  | { kind: 'hand'; playerId: PlayerId; index: number };

/** Solo información pública: nunca el valor de una carta que siga oculta. */
export type GameEvent =
  | { type: 'turn'; playerId: PlayerId }
  | { type: 'skip'; playerId: PlayerId }
  | { type: 'reveal'; by: PlayerId; value: Value; from: RevealFrom }
  | { type: 'mismatch'; by: PlayerId }
  | { type: 'trio'; by: PlayerId; value: Value }
  | { type: 'return'; by: PlayerId }
  | { type: 'collect'; by: PlayerId; value: Value }
  | { type: 'swapRequested'; reason: 'start' | 'trio'; teams: number[] }
  | { type: 'swapResolved'; team: number; swapped: boolean }
  | { type: 'gameOver'; winner: Winner };

export type ErrorCode =
  | 'GAME_OVER'
  | 'UNKNOWN_PLAYER'
  | 'UNKNOWN_ACTION'
  | 'WRONG_PHASE'
  | 'NOT_YOUR_TURN'
  | 'INVALID_SLOT'
  | 'SLOT_EMPTY'
  | 'ALREADY_REVEALED'
  | 'INVALID_TARGET'
  | 'INVALID_END'
  | 'NO_HIDDEN_CARDS'
  | 'NOT_IN_SWAP'
  | 'ALREADY_RESPONDED'
  | 'INVALID_INDEX';

export type ActionResult =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; error: ErrorCode };
