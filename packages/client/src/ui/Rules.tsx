import { useEffect, useRef, useState } from 'react';
import { CONNECTIONS, DEAL_TABLE, SEVENS, TRIOS_TO_WIN, VALUES, type GameMode, type Value } from '@trio/shared';
import { Card, valueClass } from './Card';
import { Book } from './Icons';

interface Props {
  /** Desde una sala o una partida: arriba se dice a qué se está jugando. */
  mode?: GameMode;
  teams?: boolean;
  /**
   * Un icono en las cabeceras, junto al sonido; un enlace en la portada; y en
   * la mesa del móvil, donde la cabecera no da para más, una fila al final.
   */
  variant?: 'icon' | 'link' | 'row';
}

const MODE_NAMES: Record<GameMode, string> = { simple: 'modo sencillo', spicy: 'modo picante' };

/** Cada conexión una sola vez: 1 y 6, 1 y 8, 2 y 5… Sale de la tabla del motor. */
export const CONNECTED_PAIRS: [Value, Value][] = VALUES.flatMap((a) =>
  CONNECTIONS[a].filter((b) => a < b).map((b): [Value, Value] => [a, b]),
);

export function RulesButton({ mode, teams = false, variant = 'icon' }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {variant === 'icon' ? (
        <button
          type="button"
          className="sound"
          onClick={() => setOpen(true)}
          aria-label="Reglas del juego"
          title="Reglas del juego"
        >
          <Book />
        </button>
      ) : variant === 'row' ? (
        <button type="button" className="rules-row" onClick={() => setOpen(true)}>
          <Book /> Reglas del juego
        </button>
      ) : (
        <button type="button" className="link" onClick={() => setOpen(true)}>
          ¿Cómo se juega?
        </button>
      )}
      {open && <RulesDialog mode={mode} teams={teams} onClose={() => setOpen(false)} />}
    </>
  );
}

/**
 * Un `<dialog>` de verdad: la mesa queda inerte detrás y Escape lo cierra. Solo
 * existe mientras está abierto, así que las reglas no ocupan la página.
 */
function RulesDialog({ mode, teams, onClose }: { mode?: GameMode; teams: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    // Sin `close()` al desmontar: al salir del documento deja de ser modal solo,
    // y en StrictMode ese cierre llegaría tarde y la cerraría nada más abrirla.
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      className="rules"
      aria-labelledby="rules-title"
      onClose={onClose}
      // Un toque en el fondo oscuro, fuera de la hoja, también la cierra.
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <header className="rules__head">
        <h2 id="rules-title">Cómo se juega</h2>
        <button type="button" className="link" onClick={onClose}>
          Cerrar
        </button>
      </header>
      <div className="rules__body">
        {mode && (
          <p className="rules__now">
            En esta sala se juega en{' '}
            <strong>
              {MODE_NAMES[mode]}
              {teams ? ', por equipos' : ''}
            </strong>
            .
          </p>
        )}
        <RulesText />
      </div>
    </dialog>
  );
}

function RulesText() {
  const teamsDeal = Object.entries(DEAL_TABLE.teams)
    .map(([players, spec]) => `${spec.handSize} a cada uno si sois ${players}`)
    .join(' y ');

  return (
    <>
      <section>
        <h3>El objetivo</h3>
        <p>
          Hay 36 cartas, del 1 al 12, tres de cada. Se trata de juntar <strong>tríos</strong>, tres
          cartas iguales, antes que nadie. Es un juego de memoria: lo que se voltea lo ve toda la mesa,
          y luego vuelve boca abajo a su sitio.
        </p>
      </section>

      <section>
        <h3>El reparto</h3>
        <p>Cada uno recibe su mano, ya ordenada de menor a mayor. Lo que sobra queda boca abajo en el centro.</p>
        <table className="rules__deal">
          <thead>
            <tr>
              <th scope="col">Jugadores</th>
              <th scope="col">En cada mano</th>
              <th scope="col">En el centro</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(DEAL_TABLE.solo).map(([players, spec]) => (
              <tr key={players}>
                <th scope="row">{players}</th>
                <td>{spec.handSize}</td>
                <td>{spec.centerSize}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>Empieza quien diga el azar, y el turno pasa de uno en uno.</p>
      </section>

      <section>
        <h3>Tu turno</h3>
        <p>Volteas cartas de una en una, y eliges cada una después de ver la anterior. Puede ser:</p>
        <ul>
          <li>cualquier carta del centro, tocándola;</li>
          <li>
            la <strong>más baja</strong> o la <strong>más alta</strong> de cualquier mano, también la
            tuya, con los botones de cada mano. Nunca una del medio.
          </li>
        </ul>
        <p>Se puede repetir: pedirle a alguien su carta más alta y luego la que ahora es su más alta.</p>
        <ul>
          <li>
            <strong>Si sacas tres iguales</strong>, te llevas el trío y pasa el turno.
          </li>
          <li>
            <strong>Si sale un número distinto al anterior</strong>, se acabó. Las cartas se quedan a la
            vista hasta que pulsas «Continuar»: tú decides cuánto tiempo tiene la mesa para
            memorizarlas. Luego vuelven boca abajo a su sitio y pasa el turno.
          </li>
        </ul>
        <p>Si te quedas sin cartas en la mano, sigues jugando con las del centro y las de los demás.</p>
      </section>

      <section>
        <h3>Cómo se gana</h3>
        <h4>Modo sencillo</h4>
        <p>
          Gana quien junte <strong>{TRIOS_TO_WIN.simple} tríos</strong>, sean cuales sean.
        </p>
        <h4>Modo picante</h4>
        <p>
          Gana quien junte <strong>{TRIOS_TO_WIN.spicy} tríos conectados</strong>. Dos números están
          conectados si suman 7 o se llevan 7, y cada carta lleva los suyos en las esquinas de arriba.
        </p>
        <div className="rules__example">
          <Card value={2} />
          <p>
            El 2 conecta con el 5 y con el 9: gana un trío de doses con otro de cincos, o con otro de
            nueves.
          </p>
        </div>
        <p>Todas las conexiones:</p>
        <ul className="pairs">
          {CONNECTED_PAIRS.map(([a, b]) => (
            <li key={`${a}-${b}`} className="pair" aria-label={`${a} y ${b}`}>
              <span className={`pair__n ${valueClass(a)}`}>{a}</span>
              <span aria-hidden="true">·</span>
              <span className={`pair__n ${valueClass(b)}`}>{b}</span>
            </li>
          ))}
        </ul>
        <h4>En los dos</h4>
        <p>
          El <strong>trío de sietes</strong> gana la partida al momento. El {SEVENS} no conecta con nada:
          no le hace falta.
        </p>
      </section>

      <section>
        <h3>Por equipos</h3>
        <p>
          Con 4 o 6 jugadores se puede jugar por parejas, en cualquiera de los dos modos. Los compañeros
          se sientan enfrente y suman sus tríos: gana la pareja.
        </p>
        <ul>
          <li>Se reparten todas las cartas, {teamsDeal}. No hay centro.</li>
          <li>
            Al empezar, cada pareja puede intercambiar una carta. Los dos eligen a la vez, sin enseñarla,
            y solo hay cambio si los dos eligen; también se puede pasar.
          </li>
          <li>Cada vez que una pareja gana un trío, las demás pueden volver a intercambiar.</li>
          <li>El intercambio es la única forma de hablar con tu compañero: nada de señas.</li>
        </ul>
      </section>

      <section>
        <h3>En esta versión</h3>
        <ul>
          <li>
            El registro de jugadas no hace de chuleta: de las cartas que ya volvieron boca abajo solo
            cuenta quién las volteó y de dónde.
          </li>
          <li>
            Si quien tiene el turno no pulsa «Continuar», la partida sigue sola pasado el tiempo que
            marque la sala.
          </li>
          <li>
            Los bots solo recuerdan lo que ha visto toda la mesa. Si alguien se desconecta, un bot juega
            por él hasta que vuelva.
          </li>
        </ul>
      </section>

      <p className="rules__credits">
        <strong>Trio</strong> es un juego de Kaya Miyano, publicado en España por Devir. Esta es una
        versión casera y sin ánimo de lucro.
      </p>
    </>
  );
}
