import { useEffect, useState, type CSSProperties } from 'react';
import type { Value } from '@trio/shared';

/** Debe coincidir con la duración del volteo en styles.css. */
const FLIP_MS = 420;

export type CardSize = 'sm' | 'md' | 'lg';

interface Props {
  /** El valor si quien mira puede verlo; null si para él está boca abajo. */
  value: Value | null;
  /** Además, está boca arriba para toda la mesa. */
  exposed?: boolean;
  /** Acaba de llegar a tu mano (intercambio con el compañero). */
  fresh?: boolean;
  size?: CardSize;
  /** Qué es esta carta, para quien use lector de pantalla: «Hueco 3», «Tu carta 2ª»… */
  label?: string;
  onClick?: () => void;
}

/**
 * Al volver boca abajo, la carta conserva su valor el tiempo justo de la
 * animación y lo olvida: lo que ya no se ve no debe quedarse ni en el DOM.
 */
function useFlippingValue(value: Value | null): Value | null {
  const [shown, setShown] = useState(value);
  const [previous, setPrevious] = useState(value);
  if (value !== previous) {
    setPrevious(value);
    if (value !== null) setShown(value);
  }

  useEffect(() => {
    if (value !== null) return;
    const timer = setTimeout(() => setShown(null), FLIP_MS);
    return () => clearTimeout(timer);
  }, [value]);

  return shown;
}

const hueStyle = (value: Value): CSSProperties => ({ '--hue': (value - 1) * 30 }) as CSSProperties;

export function Card({ value, exposed = false, fresh = false, size = 'md', label, onClick }: Props) {
  const shown = useFlippingValue(value);
  const faceUp = value !== null;
  const classes = ['card', `card--${size}`];
  if (faceUp) classes.push('is-up');
  if (exposed) classes.push('is-exposed');
  if (fresh) classes.push('is-fresh');
  if (onClick) classes.push('is-choosable');

  const description = [
    label,
    faceUp ? `carta ${value}` : 'carta boca abajo',
    exposed ? 'a la vista de todos' : null,
    fresh ? 'te la acaba de dar tu compañero' : null,
  ]
    .filter(Boolean)
    .join(', ');

  const body = (
    <span className="card__flip">
      <span className="card__face card__back" aria-hidden="true" />
      <span className="card__face card__front" style={shown === null ? undefined : hueStyle(shown)}>
        <span className="card__value">{shown}</span>
        {/* Hueco de los números pequeños del futuro modo Picante. */}
        <span className="card__corner" aria-hidden="true" />
      </span>
    </span>
  );

  if (onClick) {
    return (
      <button type="button" className={classes.join(' ')} onClick={onClick} aria-label={description}>
        {body}
      </button>
    );
  }
  return (
    <span className={classes.join(' ')} role="img" aria-label={description}>
      {body}
    </span>
  );
}

/** Hueco del centro del que ya se retiró un trío. */
export function EmptySlot({ label }: { label: string }) {
  return <span className="card card--lg card--empty" role="img" aria-label={`${label}, vacío`} />;
}

export function Trios({ values }: { values: Value[] }) {
  if (values.length === 0) return null;
  return (
    <span className="trios" aria-label={`Tríos: ${values.join(', ')}`}>
      {values.map((value, i) => (
        <span className="trios__chip" key={`${value}-${i}`} style={hueStyle(value)} aria-hidden="true">
          {value}
        </span>
      ))}
    </span>
  );
}
