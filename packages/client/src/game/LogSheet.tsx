import type { LogEntry } from '@trio/shared';
import { logText, type Names } from '../text';

interface Props {
  log: LogEntry[];
  names: Names;
  /** En escritorio hay sitio: el registro va siempre abierto en el lateral. */
  pinned?: boolean;
}

/**
 * El registro no hace de chuleta: el servidor solo manda el valor de las cartas
 * que siguen boca arriba. De las que ya volvieron solo queda quién y de dónde.
 */
export function LogSheet({ log, names, pinned = false }: Props) {
  const lines = log
    .map((entry, i) => ({ key: i, text: logText(entry, names) }))
    .filter((line): line is { key: number; text: string } => line.text !== null)
    .reverse();

  const body =
    lines.length === 0 ? (
      <p className="log__empty">Todavía no ha pasado nada.</p>
    ) : (
      <ul className="log__list" aria-label="Jugadas, de la más reciente a la más antigua">
        {lines.map((line) => (
          <li key={line.key}>{line.text}</li>
        ))}
      </ul>
    );

  if (pinned) {
    return (
      <section className="log is-pinned" aria-labelledby="log-title">
        <h2 className="log__title" id="log-title">
          Registro de jugadas
        </h2>
        {body}
      </section>
    );
  }
  return (
    <details className="log">
      <summary>Registro de jugadas</summary>
      {body}
    </details>
  );
}
