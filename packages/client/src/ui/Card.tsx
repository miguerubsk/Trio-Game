import { useEffect, useState } from 'react';
import type { Value } from '@trio/shared';

/** Debe coincidir con la duración del volteo en styles.css. */
const FLIP_MS = 420;

export type CardSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

/** Cómo acabó la jugada para esta carta, mientras sigue boca arriba. */
export type CardMark = 'trio' | 'miss';

interface Props {
  /** El valor si quien mira puede verlo; null si para él está boca abajo. */
  value: Value | null;
  /** Además, está boca arriba para toda la mesa. */
  exposed?: boolean;
  /** Acaba de llegar a tu mano (intercambio con el compañero). */
  fresh?: boolean;
  /** Forma parte del trío, o es la que no casó. */
  mark?: CardMark | null;
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

/** El color de cada número vive en styles.css, en las clases `.v1` a `.v12`. */
export const valueClass = (value: Value): string => `v${value}`;

export function Card({
  value,
  exposed = false,
  fresh = false,
  mark = null,
  size = 'md',
  label,
  onClick,
}: Props) {
  const shown = useFlippingValue(value);
  const faceUp = value !== null;
  const classes = ['card', `card--${size}`];
  if (shown !== null) classes.push(valueClass(shown));
  if (shown !== null && shown >= 10) classes.push('is-wide');
  if (faceUp) classes.push('is-up');
  if (exposed) classes.push('is-exposed');
  if (fresh) classes.push('is-fresh');
  if (mark) classes.push(`is-${mark}`);
  if (onClick) classes.push('is-choosable');

  const description = [
    label,
    faceUp ? `carta ${value}` : 'carta boca abajo',
    exposed ? 'a la vista de todos' : null,
    mark === 'trio' ? 'forma trío' : mark === 'miss' ? 'no coincide' : null,
    fresh ? 'te la acaba de dar tu compañero' : null,
  ]
    .filter(Boolean)
    .join(', ');

  const body = (
    <span className="card__flip">
      <span className="card__face card__back" aria-hidden="true" />
      {/* El número del pie, como en una baraja, lo pinta el CSS con `data-value`. */}
      <span className="card__face card__front" data-value={shown ?? undefined}>
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
export function EmptySlot({ label, size = 'lg' }: { label?: string; size?: CardSize }) {
  if (!label) return <span className={`card card--${size} card--empty`} aria-hidden="true" />;
  return <span className={`card card--${size} card--empty`} role="img" aria-label={`${label}, vacío`} />;
}

/**
 * Los tríos de alguien, cada uno como un mazo de tres. Con `target` se ven
 * también los huecos que faltan para ganar.
 */
export function Progress({ values, target }: { values: Value[]; target?: number }) {
  const slots = Math.max(target ?? 0, values.length);
  if (slots === 0) return null;
  const count = target ? ` (${values.length} de ${target})` : '';
  const label = values.length ? `Tríos: ${values.join(', ')}${count}` : `Sin tríos${count}`;

  return (
    <span className="progress" role="img" aria-label={label}>
      {Array.from({ length: slots }, (_, i) => {
        const value = values[i];
        return value === undefined ? (
          <span className="progress__slot" key={i} />
        ) : (
          <span className={`progress__slot is-won ${valueClass(value)}`} key={i}>
            {value}
          </span>
        );
      })}
    </span>
  );
}

/** Tres cartas iguales en abanico: un trío ya ganado. */
export function TrioFan({ value }: { value: Value }) {
  return (
    <span className="trio-fan" aria-hidden="true">
      <Card value={value} />
      <Card value={value} />
      <Card value={value} />
    </span>
  );
}
