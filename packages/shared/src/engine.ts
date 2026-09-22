import { connected, SEVENS, type Value } from './cards';
import {
  clone,
  currentPlayer,
  handOf,
  hiddenIndex,
  isRevealed,
  playerById,
  teamIndexes,
  teamMembers,
  triosOf,
  trioValuesOfSide,
  valueOf,
} from './helpers';
import { openSwap, respondSwap } from './swap';
import { advanceSeat, beginTurn } from './turn';
import type {
  Action,
  ActionResult,
  CardId,
  CardOrigin,
  ErrorCode,
  GameEvent,
  GameState,
  Outcome,
  PlayerId,
  RevealFrom,
  Winner,
} from './types';

type RevealAction = Extract<Action, { type: 'REVEAL_CENTER' | 'REVEAL_PLAYER' }>;

/** El estado se clona en cada acción: el registro se acota para que no crezca con la partida. */
const LOG_LIMIT = 200;

/**
 * Único punto de entrada para cambiar la partida. Pura: no muta `state`, no usa
 * red ni temporizadores. Los temporizadores del servidor (jugador ausente,
 * intercambio sin responder) actúan a través de esta misma función.
 */
export function applyAction(state: GameState, actor: PlayerId, action: Action): ActionResult {
  if (state.phase === 'finished') return { ok: false, error: 'GAME_OVER' };
  if (!state.players.some((p) => p.id === actor)) return { ok: false, error: 'UNKNOWN_PLAYER' };

  const s = clone(state);
  const events: GameEvent[] = [];
  const error = dispatch(s, actor, action, events);
  if (error) return { ok: false, error };
  return commit(s, events);
}

/**
 * Salta el turno del jugador activo sin que juegue; las cartas que hubiera
 * volteado vuelven a su sitio. No es una acción de jugador (no está en Action
 * ni en legalActions): la usa el servidor cuando el jugador activo ha sido
 * expulsado. Solo tiene sentido mientras se espera una revelación; en
 * `awaitingReturn` el servidor confirma en su nombre.
 */
export function skipTurn(state: GameState): ActionResult {
  if (state.phase === 'finished') return { ok: false, error: 'GAME_OVER' };
  if (state.phase !== 'awaitingReveal') return { ok: false, error: 'WRONG_PHASE' };

  const s = clone(state);
  const events: GameEvent[] = [];
  const skipped = currentPlayer(s).id;
  if (s.revealed.length > 0) {
    s.revealed = [];
    events.push({ type: 'return', by: skipped });
  }
  events.push({ type: 'skip', playerId: skipped });
  advanceSeat(s);
  beginTurn(s, events);
  return commit(s, events);
}

function commit(s: GameState, events: GameEvent[]): ActionResult {
  s.log.push(...events);
  if (s.log.length > LOG_LIMIT) s.log.splice(0, s.log.length - LOG_LIMIT);
  return { ok: true, state: s, events };
}

function dispatch(
  s: GameState,
  actor: PlayerId,
  action: Action,
  events: GameEvent[],
): ErrorCode | null {
  if (typeof action !== 'object' || action === null) return 'UNKNOWN_ACTION';
  switch (action.type) {
    case 'REVEAL_CENTER':
    case 'REVEAL_PLAYER':
      return reveal(s, actor, action, events);
    case 'CONFIRM_RETURN':
      return confirmReturn(s, actor, events);
    case 'SWAP_CHOOSE':
      return respondSwap(s, actor, action.handIndex, events);
    case 'SWAP_PASS':
      return respondSwap(s, actor, 'pass', events);
    default:
      return 'UNKNOWN_ACTION';
  }
}

interface Picked {
  cardId: CardId;
  origin: CardOrigin;
  from: RevealFrom;
}

function pickCard(s: GameState, action: RevealAction): Picked | ErrorCode {
  if (action.type === 'REVEAL_CENTER') {
    const { slot } = action;
    if (!Number.isInteger(slot) || slot < 0 || slot >= s.center.length) return 'INVALID_SLOT';
    const cardId = s.center[slot];
    if (cardId === null || cardId === undefined) return 'SLOT_EMPTY';
    if (isRevealed(s, cardId)) return 'ALREADY_REVEALED';
    return { cardId, origin: { kind: 'center', slot }, from: { kind: 'center', slot } };
  }

  const { targetId, end } = action;
  if (typeof targetId !== 'string' || !s.players.some((p) => p.id === targetId)) {
    return 'INVALID_TARGET';
  }
  if (end !== 'lowest' && end !== 'highest') return 'INVALID_END';
  const index = hiddenIndex(s, targetId, end);
  if (index < 0) return 'NO_HIDDEN_CARDS';
  const cardId = handOf(s, targetId)[index] as CardId;
  return {
    cardId,
    origin: { kind: 'hand', playerId: targetId },
    from: { kind: 'hand', playerId: targetId, index },
  };
}

function reveal(
  s: GameState,
  actor: PlayerId,
  action: RevealAction,
  events: GameEvent[],
): ErrorCode | null {
  if (s.phase !== 'awaitingReveal') return 'WRONG_PHASE';
  if (currentPlayer(s).id !== actor) return 'NOT_YOUR_TURN';

  const picked = pickCard(s, action);
  if (typeof picked === 'string') return picked;

  s.revealed.push({ cardId: picked.cardId, origin: picked.origin });
  events.push({
    type: 'reveal',
    by: actor,
    value: valueOf(s, picked.cardId),
    from: picked.from,
  });
  resolveReveals(s, actor, events);
  return null;
}

function resolveReveals(s: GameState, actor: PlayerId, events: GameEvent[]): void {
  const values = s.revealed.map((r) => valueOf(s, r.cardId));
  const [first, second, third] = values;

  const failed = () => {
    events.push({ type: 'mismatch', by: actor });
    settle(s, 'mismatch');
  };

  if (values.length === 1) return;
  if (values.length === 2) {
    if (first === second) return; // casan: el turno sigue y hace falta una tercera
    return failed();
  }
  if (third !== first) return failed();

  const value = first as Value;
  events.push({ type: 'trio', by: actor, value });
  const reason = winReason(s, actor, value);
  if (reason) {
    // Victoria inmediata: no hay «continuar» que esperar, el trío se anota ya.
    collectTrio(s, actor, events);
    finish(s, actor, reason, events);
    return;
  }
  settle(s, 'trio');
}

/** Congela el tablero con las cartas boca arriba hasta el «continuar» del jugador activo. */
function settle(s: GameState, outcome: Outcome): void {
  s.phase = 'awaitingReturn';
  s.outcome = outcome;
}

/** Se mira con el trío recién formado, antes de anotarlo. */
function winReason(s: GameState, actor: PlayerId, value: Value): Winner['reason'] | null {
  if (value === SEVENS) return 'sevens';
  const won = trioValuesOfSide(s, actor);
  if (s.config.mode === 'spicy') return won.some((v) => connected(v, value)) ? 'connected' : null;
  return won.length + 1 >= s.config.targetTrios ? 'trios' : null;
}

function confirmReturn(s: GameState, actor: PlayerId, events: GameEvent[]): ErrorCode | null {
  if (s.phase !== 'awaitingReturn') return 'WRONG_PHASE';
  if (currentPlayer(s).id !== actor) return 'NOT_YOUR_TURN';

  const wasTrio = s.outcome === 'trio';
  if (wasTrio) {
    collectTrio(s, actor, events);
  } else {
    s.revealed = [];
    events.push({ type: 'return', by: actor });
  }
  s.outcome = null;

  // Tanto tras un trío como tras un fallo, el turno pasa al siguiente jugador.
  advanceSeat(s);
  if (wasTrio && s.config.teams) {
    const actorTeam = playerById(s, actor).team;
    openSwap(s, 'trio', teamIndexes(s).filter((t) => t !== actorTeam), events);
  } else {
    beginTurn(s, events);
  }
  return null;
}

/** Retira las tres cartas reveladas de donde estén y anota el trío al jugador. */
function collectTrio(s: GameState, actor: PlayerId, events: GameEvent[]): void {
  const value = valueOf(s, (s.revealed[0] as { cardId: CardId }).cardId);
  for (const { cardId, origin } of s.revealed) {
    if (origin.kind === 'center') {
      s.center[origin.slot] = null;
    } else {
      const hand = handOf(s, origin.playerId);
      const at = hand.indexOf(cardId);
      if (at < 0) throw new Error(`La carta ${cardId} no está en la mano de ${origin.playerId}`);
      hand.splice(at, 1);
    }
  }
  s.revealed = [];
  triosOf(s, actor).push(value);
  events.push({ type: 'collect', by: actor, value });
}

function finish(s: GameState, actor: PlayerId, reason: Winner['reason'], events: GameEvent[]): void {
  const team = s.config.teams ? playerById(s, actor).team : null;
  const winner: Winner = {
    playerIds: team === null ? [actor] : teamMembers(s, team),
    team,
    reason,
  };
  s.winner = winner;
  s.phase = 'finished';
  s.outcome = null;
  s.swap = null;
  events.push({ type: 'gameOver', winner });
}
