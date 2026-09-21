import { useEffect, useRef } from 'react';
import type { PlayerView } from '@trio/shared';
import { soundsFor } from './events';
import { play } from './player';

/** Pone sonido a lo que pasa en la mesa, comparando cada vista con la anterior. */
export function useGameSounds(view: PlayerView): void {
  const previous = useRef<PlayerView | null>(null);

  useEffect(() => {
    const before = previous.current;
    previous.current = view;
    for (const cue of soundsFor(before, view)) play(cue.sound, cue.count);
  }, [view]);
}
