import type { CSSProperties } from 'react';
import type { CenterSlotView } from '@trio/shared';
import { Card, EmptySlot } from '../ui/Card';

interface Props {
  slots: CenterSlotView[];
  /** Huecos que se pueden voltear ahora mismo. */
  choosable: number[];
  onReveal: (slot: number) => void;
}

/**
 * Los huecos son fijos: una carta que no casa vuelve al suyo. Por eso nunca se
 * reordenan ni se compactan cuando un trío deja un hueco vacío.
 */
export function Center({ slots, choosable, onReveal }: Props) {
  if (slots.length === 0) return null;
  // Rejilla de columnas fijas: los huecos no se mueven nunca de sitio, que es
  // justo lo que se memoriza. 9 y 6 cartas quedan en 3 columnas; 8, en 4.
  const columns = slots.length % 3 === 0 ? 3 : 4;

  return (
    <section className="center" aria-label="Centro de la mesa">
      <div className="center__grid" style={{ '--cols': columns } as CSSProperties}>
        {slots.map((slot, i) => {
          const label = `Hueco ${i + 1}`;
          if (slot.state === 'empty') return <EmptySlot key={i} label={label} />;
          return (
            <Card
              key={i}
              value={slot.state === 'up' ? slot.value : null}
              exposed={slot.state === 'up'}
              size="lg"
              label={label}
              onClick={choosable.includes(i) ? () => onReveal(i) : undefined}
            />
          );
        })}
      </div>
    </section>
  );
}
