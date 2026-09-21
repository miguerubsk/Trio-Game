import type { PlayerId, PlayerView, RevealFrom } from '@trio/shared';
import type { CardMark } from '../ui/Card';

/**
 * Con la jugada ya resuelta y las cartas aún boca arriba, qué le toca a cada
 * una: las tres del trío brillan, y de un fallo solo se señala la que no casó,
 * que es siempre la última.
 */
function markWhere(view: PlayerView, match: (from: RevealFrom) => boolean): CardMark | null {
  if (view.phase !== 'awaitingReturn' || view.outcome === null) return null;
  const at = view.revealed.findIndex((r) => match(r.from));
  if (at < 0) return null;
  if (view.outcome === 'trio') return 'trio';
  return at === view.revealed.length - 1 ? 'miss' : null;
}

export const centerMark = (view: PlayerView, slot: number): CardMark | null =>
  markWhere(view, (from) => from.kind === 'center' && from.slot === slot);

export const handMark = (view: PlayerView, playerId: PlayerId, index: number): CardMark | null =>
  markWhere(view, (from) => from.kind === 'hand' && from.playerId === playerId && from.index === index);

/** Lo mismo para la estela de la barra de estado, que va por orden de volteo. */
export function trailMark(view: PlayerView, position: number): CardMark | null {
  if (view.phase !== 'awaitingReturn' || view.outcome === null) return null;
  if (view.outcome === 'trio') return 'trio';
  return position === view.revealed.length - 1 ? 'miss' : null;
}
