import type { PlayerView, PublicPlayerView } from '@trio/shared';
import { Trios } from '../ui/Card';

/** Los equipos de la partida, en orden, con sus dos miembros. */
export function teamsOf(view: PlayerView): { team: number; members: PublicPlayerView[] }[] {
  const teams = [...new Set(view.players.map((p) => p.team).filter((t) => t !== null))].sort(
    (a, b) => a - b,
  );
  return teams.map((team) => ({ team, members: view.players.filter((p) => p.team === team) }));
}

/** Marcador por equipos: los tríos de los dos compañeros suman para la victoria. */
export function TeamScore({ view }: { view: PlayerView }) {
  if (view.mode !== 'teams') return null;

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
            <p className="muted">{members.map((m) => m.name).join(' y ')}</p>
            <p className="teams__score">
              <Trios values={trios} />
              <span className="muted">
                {trios.length} de {view.targetTrios}
              </span>
            </p>
          </article>
        );
      })}
    </section>
  );
}
