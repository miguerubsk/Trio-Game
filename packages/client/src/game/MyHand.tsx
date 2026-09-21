import type { End, PlayerView, Value } from '@trio/shared';
import { Card, Progress } from '../ui/Card';
import { Avatar } from '../ui/Icons';
import { HandRow } from './HandRow';
import { handMark } from './marks';

interface Props {
  view: PlayerView;
  /** null si ahora mismo no puedes pedirte cartas a ti mismo. */
  onAsk: ((end: End) => void) | null;
  /** Durante un intercambio: elegir con qué carta te quedas sin quedarte. */
  onChoose?: ((handIndex: number) => void) | null;
  /** La que acaba de darte tu compañero, para reconocerla de un vistazo. */
  received?: Value | null;
  /** En qué orden se volteó cada carta tuya este turno. */
  orderAt: (index: number) => number;
}

export function MyHand({ view, onAsk, onChoose, received, orderAt }: Props) {
  const me = view.players.find((p) => p.id === view.me);
  // Con cartas repetidas da igual cuál se marque: son la misma carta.
  const fresh = received == null ? -1 : view.myHand.findIndex((c) => c.value === received);
  const myTurn = view.currentPlayerId === view.me && view.phase !== 'finished';

  return (
    <section className="myhand" aria-label="Tu mano">
      <header className="myhand__head">
        <Avatar name={me?.name ?? ''} active={myTurn} />
        <h2>Tu mano</h2>
        <Progress values={me?.trios ?? []} target={view.mode === 'teams' ? undefined : view.targetTrios} />
      </header>

      {received != null && (
        <p className="myhand__received">Tu compañero te ha dado un {received}.</p>
      )}

      {view.myHand.length === 0 ? (
        <p className="player__empty">Te has quedado sin cartas.</p>
      ) : (
        <HandRow who="Mi" count={view.myHand.length} onAsk={onAsk}>
          {view.myHand.map((card, i) => (
            <Card
              key={i}
              value={card.value}
              exposed={card.faceUp}
              fresh={i === fresh}
              mark={handMark(view, view.me, i)}
              index={i}
              order={orderAt(i)}
              size="md"
              label={`Tu carta ${i + 1}`}
              onClick={onChoose ? () => onChoose(i) : undefined}
            />
          ))}
        </HandRow>
      )}
    </section>
  );
}
