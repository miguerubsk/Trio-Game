import type { End, MemberView, PublicPlayerView } from '@trio/shared';
import { Card, Trios } from '../ui/Card';

interface Props {
  player: PublicPlayerView;
  /** Lo que sabe la sala de este jugador: conexión, si se ha ido. */
  member: MemberView | undefined;
  isCurrent: boolean;
  /** Tu pareja en el modo por equipos. */
  isPartner: boolean;
  /** null si ahora mismo no se le pueden pedir cartas. */
  onAsk: ((end: End) => void) | null;
  onKick: (() => void) | null;
  /** Que un bot juegue por él; null si no procede. */
  onSubstitute: (() => void) | null;
}

export function PlayerRow({ player, member, isCurrent, isPartner, onAsk, onKick, onSubstitute }: Props) {
  const classes = ['player'];
  if (isCurrent) classes.push('is-current');
  if (member?.gone) classes.push('is-gone');

  return (
    <article className={classes.join(' ')}>
      <header className="player__head">
        <h3 className="player__name">{player.name}</h3>
        {isCurrent && <span className="tag tag--turn">juega</span>}
        {isPartner && <span className="tag tag--team">tu compañero</span>}
        {member?.bot && <span className="tag tag--bot">bot</span>}
        {member?.playedByBot && <span className="tag tag--bot">juega un bot</span>}
        {member?.gone && <span className="tag">se fue</span>}
        {member && !member.gone && !member.connected && !member.playedByBot && (
          <span className="tag tag--warn">sin conexión</span>
        )}
        <Trios values={player.trios} />
        {onSubstitute && (
          <button type="button" className="link" onClick={onSubstitute}>
            Que juegue un bot
          </button>
        )}
        {onKick && (
          <button type="button" className="link" onClick={onKick}>
            Expulsar
          </button>
        )}
      </header>

      {player.hand.length === 0 ? (
        <p className="player__empty">Se ha quedado sin cartas.</p>
      ) : (
        <div className="hand hand--small">
          {player.hand.map((slot, i) => (
            <Card
              key={i}
              value={slot.faceUp ? slot.value : null}
              exposed={slot.faceUp}
              size="sm"
              label={`Carta ${i + 1} de ${player.name}`}
            />
          ))}
        </div>
      )}

      {onAsk && (
        <div className="asks">
          <button type="button" className="btn btn--ask" onClick={() => onAsk('lowest')}>
            ▼ Su más baja
          </button>
          <button type="button" className="btn btn--ask" onClick={() => onAsk('highest')}>
            ▲ Su más alta
          </button>
        </div>
      )}
    </article>
  );
}
