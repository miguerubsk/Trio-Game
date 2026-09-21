import { useEffect, useRef } from 'react';
import type { PlayerId, PlayerView, RevealFrom, RevealedView } from '@trio/shared';
import type { CardMark } from '../ui/Card';

const samePlace = (a: RevealFrom, b: RevealFrom): boolean =>
  a.kind === 'center' && b.kind === 'center'
    ? a.slot === b.slot
    : a.kind === 'hand' && b.kind === 'hand' && a.playerId === b.playerId && a.index === b.index;

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

/**
 * En qué orden se volteó cada carta este turno, para que vuelvan boca abajo en
 * ese mismo orden. Cuando la jugada se cierra, el servidor ya no manda la
 * lista, así que se guarda la última: sin ella todas se girarían a la vez.
 */
export function useRevealOrder(view: PlayerView): (from: RevealFrom) => number {
  const last = useRef<RevealedView[]>([]);
  useEffect(() => {
    if (view.revealed.length > 0) last.current = view.revealed;
  }, [view.revealed]);
  const list = view.revealed.length > 0 ? view.revealed : last.current;
  return (from) => Math.max(0, list.findIndex((r) => samePlace(r.from, from)));
}
