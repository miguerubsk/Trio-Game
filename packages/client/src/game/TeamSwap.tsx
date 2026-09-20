import type { PlayerView } from '@trio/shared';
import { nameOf, type Names } from '../text';

interface Props {
  view: PlayerView;
  names: Names;
  onPass: () => void;
}

/**
 * Los dos compañeros eligen a la vez y solo hay intercambio si los dos eligen
 * carta. La carta se elige tocándola en tu mano, aquí abajo.
 */
export function TeamSwap({ view, names, onPass }: Props) {
  const swap = view.swap;
  if (!swap) return null;

  const me = view.players.find((p) => p.id === view.me);
  const partner = view.players.find((p) => p.id !== view.me && p.team !== null && p.team === me?.team);
  const myTurn = view.legal.swap !== null;

  return (
    <section className="swap" aria-label="Intercambio con tu compañero">
      <h2>
        {swap.reason === 'start'
          ? 'Antes de empezar: intercambio de parejas'
          : 'Un equipo rival ha hecho trío: podéis intercambiar'}
      </h2>

      {myTurn ? (
        <>
          <p className="hint">
            Toca una carta de tu mano para dársela a {partner ? partner.name : 'tu compañero'}. Solo hay
            intercambio si los dos elegís carta.
          </p>
          <button type="button" className="btn" onClick={onPass}>
            Pasar
          </button>
        </>
      ) : (
        <p className="hint">
          {swap.myResponse === 'pass'
            ? 'Has pasado.'
            : typeof swap.myResponse === 'number'
              ? 'Ya has elegido carta.'
              : 'Tu equipo no participa en este intercambio.'}
        </p>
      )}

      <ul className="swap__teams">
        {swap.teams.map((entry) => (
          <li key={entry.team}>
            <strong>Equipo {entry.team + 1}:</strong>{' '}
            {entry.done
              ? 'listo'
              : Object.entries(entry.responded)
                  .map(([id, answered]) => `${nameOf(names, id)} ${answered ? '✓' : '…'}`)
                  .join(', ')}
          </li>
        ))}
      </ul>
    </section>
  );
}
