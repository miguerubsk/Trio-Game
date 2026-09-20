import { currentPlayer } from './helpers';
import type { GameEvent, GameState } from './types';

/** Pasa al siguiente asiento. */
export function advanceSeat(s: GameState): void {
  s.currentPlayerIndex = (s.currentPlayerIndex + 1) % s.players.length;
}

/** Abre el turno del jugador actual. */
export function beginTurn(s: GameState, events: GameEvent[]): void {
  s.phase = 'awaitingReveal';
  s.outcome = null;
  events.push({ type: 'turn', playerId: currentPlayer(s).id });
}
