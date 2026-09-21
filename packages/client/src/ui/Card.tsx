import { useEffect, useState, type CSSProperties } from 'react';
import type { Value } from '@trio/shared';

/** Las dos deben coincidir con styles.css: el volteo y lo que se retrasa cada carta. */
const FLIP_MS = 460;
const STAGGER_MS = 90;

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
  /** Su sitio en la mano o en el centro: las cartas se reparten una tras otra. */
  index?: number;
  /** En qué orden se volteó este turno: en ese mismo orden vuelven boca abajo. */
  order?: number;
  /** Qué es esta carta, para quien use lector de pantalla: «Hueco 3», «Tu carta 2ª»… */
  label?: string;
  onClick?: () => void;
}

/**
 * Al volver boca abajo, la carta conserva su valor el tiempo justo de la
 * animación y lo olvida: lo que ya no se ve no debe quedarse ni en el DOM.
 */
function useFlippingValue(value: Value | null, order: number): Value | null {
  const [shown, setShown] = useState(value);
  const [previous, setPrevious] = useState(value);
  if (value !== previous) {
    setPrevious(value);
    if (value !== null) setShown(value);
  }

  useEffect(() => {
    if (value !== null) return;
    // Su turno de girarse llega más tarde cuanto más tarde se volteó.
    const timer = setTimeout(() => setShown(null), FLIP_MS + order * STAGGER_MS);
    return () => clearTimeout(timer);
  }, [value, order]);

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
  index = 0,
  order = 0,
  label,
  onClick,
}: Props) {
  const shown = useFlippingValue(value, order);
  const faceUp = value !== null;
  // Está girándose boca abajo: ya no tiene valor, pero todavía se le ve la cara.
  const returning = !faceUp && shown !== null;
  const classes = ['card', `card--${size}`];
  if (shown !== null) classes.push(valueClass(shown));
  if (shown !== null && shown >= 10) classes.push('is-wide');
  if (faceUp) classes.push('is-up');
  if (returning) classes.push('is-returning');
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

  const style = { '--i': index, '--order': order } as CSSProperties;
  const body = (
    // La carta vuela (`__lift`) y gira (`__flip`) por separado: así el vuelo, el
    // rebote del trío y el temblor del fallo no se pisan con el giro.
    <span className="card__lift">
      <span className="card__flip">
        <span className="card__face card__back" aria-hidden="true" />
        {/* El número del pie, como en una baraja, lo pinta el CSS con `data-value`. */}
        <span className="card__face card__front" data-value={shown ?? undefined}>
          <span className="card__value">{shown}</span>
        {/* Hueco de los números pequeños del futuro modo Picante. */}
          <span className="card__corner" aria-hidden="true" />
        </span>
      </span>
    </span>
  );

  /*
   * Siempre un botón, apagado cuando no se puede voltear. Si cambiara de
   * etiqueta al dejar de ser pulsable, React tiraría la carta y pondría otra
   * en su sitio, ya dada la vuelta: una transición no puede animar algo que
   * acaba de nacer, y el giro se perdía justo en la carta que tocas.
   */
  return (
    <button
      type="button"
      className={classes.join(' ')}
      style={style}
      onClick={onClick}
      disabled={!onClick}
      aria-label={description}
    >
      {body}
    </button>
  );
}

/** Hueco del centro del que ya se retiró un trío. */
export function EmptySlot({ label, size = 'lg', index = 0 }: { label?: string; size?: CardSize; index?: number }) {
  const style = { '--i': index } as CSSProperties;
  if (!label) return <span className={`card card--${size} card--empty`} style={style} aria-hidden="true" />;
  return (
    <span
      className={`card card--${size} card--empty`}
      style={style}
      role="img"
      aria-label={`${label}, vacío`}
    />
  );
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
