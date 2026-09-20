import type { GameMode, Value } from './cards';
import { handOf, isRevealed, playerById, valueOf } from './helpers';
import { legalActions, type Legal } from './legal';
import type {
  GameEvent,
  GameState,
  Outcome,
  Phase,
  PlayerId,
  RevealFrom,
  SwapResponse,
  Winner,
} from './types';

export type HandSlotView = { faceUp: false } | { faceUp: true; value: Value };
export type CenterSlotView = { state: 'empty' } | { state: 'down' } | { state: 'up'; value: Value };

export interface PublicPlayerView {
  id: PlayerId;
  name: string;
  team: number | null;
  /** Lo que ve toda la mesa de esta mano: cuántas cartas hay y cuáles están boca arriba. */
  hand: HandSlotView[];
  trios: Value[];
}

export interface RevealedView {
  value: Value;
  from: RevealFrom;
}

type RevealEvent = Extract<GameEvent, { type: 'reveal' }>;

/**
 * Entrada del registro de jugadas. Una revelación cuya carta ya ha vuelto boca
 * abajo llega sin valor: en un juego de memoria, el registro no puede hacer de
 * chuleta. Sí dice quién volteó y de dónde. Los tríos conservan su valor.
 */
export type LogEntry = GameEvent | Omit<RevealEvent, 'value'>;

export interface SwapView {
  reason: 'start' | 'trio';
  teams: { team: number; done: boolean; responded: Record<PlayerId, boolean> }[];
  /** Solo la propia respuesta: la del compañero no se conoce hasta que se resuelve. */
  myResponse: SwapResponse | null;
}

/**
 * Lo único que un cliente recibe de la partida. Se construye desde cero, campo
 * a campo, en vez de copiar el estado y borrar lo secreto: así una carta nueva
 * en GameState nunca se filtra por olvido.
 */
export interface PlayerView {
  me: PlayerId;
  mode: GameMode;
  targetTrios: number;
  phase: Phase;
  outcome: Outcome | null;
  currentPlayerId: PlayerId;
  players: PublicPlayerView[];
  center: CenterSlotView[];
  revealed: RevealedView[];
  /** Mano propia con todos los valores, alineada con `players[me].hand`. */
  myHand: { value: Value; faceUp: boolean }[];
  swap: SwapView | null;
  winner: Winner | null;
  legal: Legal;
  log: LogEntry[];
}

const LOG_TAIL = 60;

export function buildView(s: GameState, viewerId: PlayerId): PlayerView {
  playerById(s, viewerId); // lanza si el jugador no existe
  const current = s.players[s.currentPlayerIndex];

  return {
    me: viewerId,
    mode: s.config.mode,
    targetTrios: s.config.targetTrios,
    phase: s.phase,
    outcome: s.outcome,
    currentPlayerId: current ? current.id : viewerId,
    players: s.players.map((p) => ({
      id: p.id,
      name: p.name,
      team: p.team,
      hand: handOf(s, p.id).map(
        (id): HandSlotView =>
          isRevealed(s, id) ? { faceUp: true, value: valueOf(s, id) } : { faceUp: false },
      ),
      trios: [...(s.trios[p.id] ?? [])],
    })),
    center: s.center.map(
      (id): CenterSlotView =>
        id === null
          ? { state: 'empty' }
          : isRevealed(s, id)
            ? { state: 'up', value: valueOf(s, id) }
            : { state: 'down' },
    ),
    revealed: s.revealed.map((r) => ({
      value: valueOf(s, r.cardId),
      from:
        r.origin.kind === 'center'
          ? { kind: 'center', slot: r.origin.slot }
          : {
              kind: 'hand',
              playerId: r.origin.playerId,
              index: handOf(s, r.origin.playerId).indexOf(r.cardId),
            },
    })),
    myHand: handOf(s, viewerId).map((id) => ({
      value: valueOf(s, id),
      faceUp: isRevealed(s, id),
    })),
    swap: swapView(s, viewerId),
    winner: s.winner,
    legal: legalActions(s, viewerId),
    log: publicLog(s),
  };
}

/**
 * Las cartas que siguen boca arriba son las de las últimas revelaciones del
 * registro, una por carta en `revealed`: solo esas conservan su valor.
 */
function publicLog(s: GameState): LogEntry[] {
  const tail = s.log.slice(-LOG_TAIL);
  let faceUp = s.revealed.length;
  const out: LogEntry[] = [];
  for (let i = tail.length - 1; i >= 0; i--) {
    const e = tail[i] as GameEvent;
    if (e.type !== 'reveal') {
      out.push(e);
    } else if (faceUp > 0) {
      faceUp--;
      out.push(e);
    } else {
      out.push({ type: 'reveal', by: e.by, from: e.from });
    }
  }
  return out.reverse();
}

function swapView(s: GameState, viewerId: PlayerId): SwapView | null {
  if (!s.swap) return null;
  const mine = s.swap.teams.find((t) => !t.done && Object.hasOwn(t.responses, viewerId));
  return {
    reason: s.swap.reason,
    teams: s.swap.teams.map((t) => ({
      team: t.team,
      done: t.done,
      responded: Object.fromEntries(Object.entries(t.responses).map(([id, r]) => [id, r !== null])),
    })),
    myResponse: mine?.responses[viewerId] ?? null,
  };
}
