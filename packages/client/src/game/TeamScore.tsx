import type { PlayerView, PublicPlayerView } from '@trio/shared';
import { Progress } from '../ui/Card';

/** Los equipos de la partida, en orden, con sus dos miembros. */
export function teamsOf(view: PlayerView): { team: number; members: PublicPlayerView[] }[] {
  const teams = [...new Set(view.players.map((p) => p.team).filter((t) => t !== null))].sort(
    (a, b) => a - b,
  );
  return teams.map((team) => ({ team, members: view.players.filter((p) => p.team === team) }));
}

/**
 * Marcador por equipos: los tríos de los dos compañeros suman para la victoria.
 * En escritorio ocupa el tapete, que en este modo no tiene cartas.
 */
export function TeamScore({ view }: { view: PlayerView }) {
  if (!view.teams) return null;

  return (
    <section className="teams" aria-label="Marcador por equipos">
      {teamsOf(view).map(({ team, members }) => {
        const trios = members.flatMap((m) => m.trios);
        const mine = members.some((m) => m.id === view.me);
        return (
          <article key={team} className={`teams__team ${mine ? 'is-mine' : ''}`}>
            <h3>
              Equipo {team + 1} {mine && <span className="tag">el tuyo</span>}
            </h3>
            <p className="teams__members">{members.map((m) => m.name).join(' y ')}</p>
            <div className="teams__score">
              <Progress values={trios} target={view.targetTrios} />
              <span className="teams__count">
                {trios.length} de {view.targetTrios}
              </span>
            </div>
          </article>
        );
      })}
    </section>
  );
}
