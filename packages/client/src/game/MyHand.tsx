import type { End, PlayerView, Value } from '@trio/shared';
import { Card, Trios } from '../ui/Card';

interface Props {
  view: PlayerView;
  /** null si ahora mismo no puedes pedirte cartas a ti mismo. */
  onAsk: ((end: End) => void) | null;
  /** Durante un intercambio: elegir con qué carta te quedas sin quedarte. */
  onChoose?: ((handIndex: number) => void) | null;
  /** La que acaba de darte tu compañero, para reconocerla de un vistazo. */
  received?: Value | null;
}

export function MyHand({ view, onAsk, onChoose, received }: Props) {
  const me = view.players.find((p) => p.id === view.me);
  // Con cartas repetidas da igual cuál se marque: son la misma carta.
  const fresh = received == null ? -1 : view.myHand.findIndex((c) => c.value === received);

  return (
    <section className="myhand" aria-label="Tu mano">
      <header className="myhand__head">
        <h2>Tu mano</h2>
        <Trios values={me?.trios ?? []} />
      </header>

      {received != null && (
        <p className="myhand__received">Tu compañero te ha dado un {received}.</p>
      )}

      {view.myHand.length === 0 ? (
        <p className="player__empty">Te has quedado sin cartas.</p>
      ) : (
        <div className="hand">
          {view.myHand.map((card, i) => (
            <Card
              key={i}
              value={card.value}
              exposed={card.faceUp}
              fresh={i === fresh}
              size="md"
              label={`Tu carta ${i + 1}`}
              onClick={onChoose ? () => onChoose(i) : undefined}
            />
          ))}
        </div>
      )}

      {onAsk && (
        <div className="asks">
          <button type="button" className="btn btn--ask" onClick={() => onAsk('lowest')}>
            ▼ Mi más baja
          </button>
          <button type="button" className="btn btn--ask" onClick={() => onAsk('highest')}>
            ▲ Mi más alta
          </button>
        </div>
      )}
    </section>
  );
}
