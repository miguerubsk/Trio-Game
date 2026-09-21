import type { CSSProperties, ReactNode } from 'react';
import type { End } from '@trio/shared';
import { ArrowDown, ArrowUp } from '../ui/Icons';

interface Props {
  /** «Su» para los demás, «Mi» para la tuya. */
  who: 'Su' | 'Mi';
  /** Cuántas cartas hay: la mano se monta un poco si no caben. */
  count: number;
  /** null si ahora mismo no se le pueden pedir cartas. */
  onAsk: ((end: End) => void) | null;
  children: ReactNode;
}

/**
 * Una mano con sus dos botones de pedir carta. En el móvil van debajo; en
 * escritorio, a los lados: la mano está ordenada, así que «la más baja» queda
 * junto a la carta de la izquierda y «la más alta» junto a la de la derecha.
 *
 * Los botones están siempre, apagados cuando no se puede pedir: si aparecieran
 * y desaparecieran, la mesa se movería entera al empezar y al cerrar cada turno.
 */
export function HandRow({ who, count, onAsk, children }: Props) {
  return (
    <div className={`handrow${onAsk ? ' can-ask' : ''}`}>
      <AskButton who={who} end="lowest" onAsk={onAsk} />
      <div className="hand" style={{ '--n': count } as CSSProperties}>
        {children}
      </div>
      <AskButton who={who} end="highest" onAsk={onAsk} />
    </div>
  );
}

function AskButton({ who, end, onAsk }: { who: Props['who']; end: End; onAsk: ((end: End) => void) | null }) {
  const low = end === 'lowest';
  const label = `${who} más ${low ? 'baja' : 'alta'}`;
  return (
    <button
      type="button"
      className={`btn ask ask--${low ? 'low' : 'high'}`}
      onClick={() => onAsk?.(end)}
      disabled={!onAsk}
      aria-label={label}
    >
      {low ? <ArrowDown /> : <ArrowUp />}
      <span className="ask__long">{label}</span>
      <span className="ask__short">{low ? 'baja' : 'alta'}</span>
    </button>
  );
}
