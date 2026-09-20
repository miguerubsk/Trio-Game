import { currentPlayer, handOf, hiddenIndex, isRevealed } from './helpers';
import type { GameState, PlayerId } from './types';

export interface Legal {
  /** Cartas que el jugador puede voltear ahora mismo. */
  reveal: { centerSlots: number[]; targets: PlayerId[] } | null;
  /** Puede cerrar la jugada y devolver (o retirar) las cartas. */
  confirm: boolean;
  /** Debe responder a un intercambio con su compañero. */
  swap: { handSize: number } | null;
}

/**
 * Qué puede hacer `viewer` ahora. Es la fuente de verdad que consume la
 * interfaz para no reimplementar las reglas; applyAction sigue validando.
 */
export function legalActions(s: GameState, viewer: PlayerId): Legal {
  const none: Legal = { reveal: null, confirm: false, swap: null };
  if (s.phase === 'finished') return none;

  if (s.phase === 'awaitingReveal' && currentPlayer(s).id === viewer) {
    const centerSlots: number[] = [];
    s.center.forEach((id, slot) => {
      if (id !== null && !isRevealed(s, id)) centerSlots.push(slot);
    });
    // Con al menos una carta oculta se puede pedir tanto la más baja como la más alta.
    const targets = s.players.filter((p) => hiddenIndex(s, p.id, 'lowest') >= 0).map((p) => p.id);
    return { ...none, reveal: { centerSlots, targets } };
  }

  if (s.phase === 'awaitingReturn' && currentPlayer(s).id === viewer) {
    return { ...none, confirm: true };
  }

  if (s.phase === 'teamSwap' && s.swap) {
    const waiting = s.swap.teams.some(
      (t) => !t.done && Object.hasOwn(t.responses, viewer) && t.responses[viewer] === null,
    );
    if (waiting) return { ...none, swap: { handSize: handOf(s, viewer).length } };
  }

  return none;
}
