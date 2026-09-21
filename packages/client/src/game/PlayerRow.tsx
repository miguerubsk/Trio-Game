import type { End, MemberView, PublicPlayerView } from '@trio/shared';
import { Card, Progress, type CardMark } from '../ui/Card';
import { Avatar } from '../ui/Icons';
import { HandRow } from './HandRow';

interface Props {
  player: PublicPlayerView;
  /** Lo que sabe la sala de este jugador: conexión, si se ha ido. */
  member: MemberView | undefined;
  isCurrent: boolean;
  /** Tu pareja en el modo por equipos. */
  isPartner: boolean;
  /** Tríos para ganar; sin él (por equipos) solo se ven los que lleva. */
  target?: number;
  /** Cómo acabó la jugada para cada carta de su mano. */
  markAt: (index: number) => CardMark | null;
  /** En qué orden se volteó cada carta suya este turno. */
  orderAt: (index: number) => number;
  /** null si ahora mismo no se le pueden pedir cartas. */
  onAsk: ((end: End) => void) | null;
  onKick: (() => void) | null;
  /** Que un bot juegue por él; null si no procede. */
  onSubstitute: (() => void) | null;
}

export function PlayerRow({
  player,
  member,
  isCurrent,
  isPartner,
  target,
  markAt,
  orderAt,
  onAsk,
  onKick,
  onSubstitute,
}: Props) {
  const classes = ['player'];
  if (isCurrent) classes.push('is-current');
  if (member?.gone) classes.push('is-gone');

  return (
    <article className={classes.join(' ')}>
      <header className="player__head">
        <Avatar name={player.name} bot={member?.bot} active={isCurrent} />
        <h3 className="player__name">{player.name}</h3>
        {isCurrent && <span className="tag tag--turn">juega</span>}
        {isPartner && <span className="tag tag--team">tu compañero</span>}
        {member?.bot && <span className="tag tag--bot">bot</span>}
        {member?.playedByBot && <span className="tag tag--bot">juega un bot</span>}
        {member?.gone && <span className="tag">se fue</span>}
        {member && !member.gone && !member.connected && !member.playedByBot && (
          <span className="tag tag--warn">sin conexión</span>
        )}
        <Progress values={player.trios} target={target} />
      </header>

      {(onSubstitute || onKick) && (
        <div className="player__admin">
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
        </div>
      )}

      {player.hand.length === 0 ? (
        <p className="player__empty">Se ha quedado sin cartas.</p>
      ) : (
        <HandRow who="Su" count={player.hand.length} onAsk={onAsk}>
          {/*
            La clave lleva el tamaño de la mano: al recoger un trío, el motor
            quita esa carta y las de detrás corren un sitio. Con la posición
            sola, React reaprovecharía la carta de al lado y enseñaría un valor
            que ya no está ahí.
          */}
          {player.hand.map((slot, i) => (
            <Card
              key={`${player.hand.length}-${i}`}
              value={slot.faceUp ? slot.value : null}
              exposed={slot.faceUp}
              mark={markAt(i)}
              index={i}
              order={orderAt(i)}
              size="sm"
              label={`Carta ${i + 1} de ${player.name}`}
            />
          ))}
        </HandRow>
      )}
    </article>
  );
}
