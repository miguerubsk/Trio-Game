import type { PlayerView } from '@trio/shared';
import type { Sound } from './player';

export interface Cue {
  sound: Sound;
  /** Cuántas cartas: para los sonidos que van uno detrás de otro. */
  count?: number;
  /** Segundos de espera, para que dos sonidos seguidos no se pisen. */
  delay?: number;
}

/**
 * Qué suena al pasar de una vista a la siguiente. Es una función pura y aparte
 * del sintetizador para poder probarla: aquí se decide, allí suena.
 *
 * Va por la partida, no por tus clics, así que también se oyen las cartas que
 * voltean los demás, que es lo que pasa en una mesa.
 */
export function soundsFor(before: PlayerView | null, after: PlayerView): Cue[] {
  if (!before) {
    // Primera vista: el reparto. Al reconectar a una partida en marcha suena
    // igual, que tampoco está de más.
    return after.phase === 'finished' ? [] : [{ sound: 'deal', count: Math.min(9, after.myHand.length) }];
  }

  const cues: Cue[] = [];
  // Un trío que gana no pasa por «continuar»: el motor lo recoge y termina en
  // la misma jugada, así que esa se cuenta aparte, al final.
  const wonNow = after.phase === 'finished' && before.phase !== 'finished';

  if (!wonNow && after.revealed.length > before.revealed.length) cues.push({ sound: 'flip' });

  if (after.outcome === 'trio' && before.outcome !== 'trio') cues.push({ sound: 'trio' });
  if (after.outcome === 'mismatch' && before.outcome !== 'mismatch') cues.push({ sound: 'miss' });

  // La jugada se cierra: o se recoge el trío, o las cartas vuelven a su sitio.
  if (!wonNow && before.revealed.length > 0 && after.revealed.length === 0) {
    cues.push(
      before.outcome === 'trio'
        ? { sound: 'collect' }
        : { sound: 'back', count: before.revealed.length },
    );
  }

  const mineNow = after.currentPlayerId === after.me;
  if (mineNow && before.currentPlayerId !== after.me && after.phase !== 'finished') {
    cues.push({ sound: 'turn' });
  }

  if (wonNow) {
    // La última carta y el trío, que no han sonado antes, uno detrás de otro.
    if (before.revealed.length > 0 && after.revealed.length === 0) {
      cues.push({ sound: 'flip' }, { sound: 'trio' }, { sound: 'collect', delay: 0.55 });
    }
    cues.push({ sound: 'win', delay: 0.8 });
  }

  return cues;
}
