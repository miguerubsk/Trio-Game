import { useEffect, useState } from 'react';
import type { PlayerView } from '@trio/shared';
import { autoActionText, statusText, type Names } from '../text';
import { Card, EmptySlot } from '../ui/Card';
import { trailMark } from './marks';

interface Props {
  view: PlayerView;
  names: Names;
  /** Cuándo actuará el servidor por su cuenta, si es que hay cuenta atrás. */
  autoActionAt: number | null;
  onConfirm: () => void;
}

/** Reloj que solo corre cuando hay una cuenta atrás que enseñar. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

export function StatusBar({ view, names, autoActionAt, onConfirm }: Props) {
  const waiting = view.phase === 'awaitingReturn' || view.phase === 'teamSwap';
  const now = useNow(waiting && autoActionAt !== null);
  const status = statusText(view, names);
  const countdown = waiting ? autoActionText(autoActionAt, now) : null;
  const mine = view.currentPlayerId === view.me;
  // La estela: las cartas de este turno, una detrás de otra, hasta tres.
  const trail = view.phase === 'awaitingReveal' || view.phase === 'awaitingReturn';

  const classes = ['status'];
  if (mine) classes.push('is-mine');
  if (view.phase === 'awaitingReturn' && view.outcome === 'trio') classes.push('is-trio');
  if (view.phase === 'awaitingReturn' && view.outcome === 'mismatch') classes.push('is-miss');

  return (
    <section className={classes.join(' ')} aria-live="polite">
      {trail && (
        <div className="trail" aria-hidden="true">
          {[0, 1, 2].map((i) => {
            const card = view.revealed[i];
            return card ? (
              <Card key={i} value={card.value} mark={trailMark(view, i)} order={i} size="xs" />
            ) : (
              <EmptySlot key={i} size="xs" />
            );
          })}
        </div>
      )}
      {/* La `key` hace que el texto se cambie con un fundido en vez de saltar. */}
      <div className="status__text">
        <p className="status__main" key={status.main}>
          {status.main}
        </p>
        {status.hint && (
          <p className="status__hint" key={status.hint}>
            {status.hint}
          </p>
        )}
        {countdown && <p className="status__countdown">{countdown}</p>}
      </div>
      {view.legal.confirm && (
        <button type="button" className="btn btn--primary btn--big" onClick={onConfirm}>
          Continuar
        </button>
      )}
    </section>
  );
}
