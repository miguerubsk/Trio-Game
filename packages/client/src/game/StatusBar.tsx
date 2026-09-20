import { useEffect, useState } from 'react';
import type { PlayerView } from '@trio/shared';
import { autoActionText, statusText, type Names } from '../text';

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

  return (
    <section className={`status ${mine ? 'is-mine' : ''}`} aria-live="polite">
      <div className="status__text">
        <p className="status__main">{status.main}</p>
        {status.hint && <p className="status__hint">{status.hint}</p>}
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
