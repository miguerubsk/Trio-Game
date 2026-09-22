/** La marca del juego: tres puntos en triángulo, como el dorso de las cartas. */
export function Logo() {
  return (
    <svg className="logo" viewBox="0 0 20 18" aria-hidden="true">
      <circle cx="10" cy="4.2" r="3.6" />
      <circle cx="4.5" cy="13.7" r="3.6" />
      <circle cx="15.5" cy="13.7" r="3.6" />
    </svg>
  );
}

export function ArrowDown() {
  return (
    <svg className="icon" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 2.5v10.5M3.8 8.8 8 13l4.2-4.2" />
    </svg>
  );
}

export function ArrowUp() {
  return (
    <svg className="icon" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 13.5V3M3.8 7.2 8 3l4.2 4.2" />
    </svg>
  );
}

/** Un libro abierto: las reglas. Mismo trazo que el altavoz del sonido. */
export function Book() {
  return (
    <svg className="icon" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M10 5.6C8.4 4.4 6.2 4 3.5 4.2v11c2.7-.2 4.9.2 6.5 1.4 1.6-1.2 3.8-1.6 6.5-1.4v-11C13.8 4 11.6 4.4 10 5.6zM10 5.6v11" />
    </svg>
  );
}

/**
 * La inicial de un jugador en un círculo. Es solo decoración: el nombre ya
 * está escrito al lado, así que el lector de pantalla se la salta.
 */
export function Avatar({
  name,
  bot = false,
  active = false,
}: {
  name: string;
  bot?: boolean;
  active?: boolean;
}) {
  const classes = ['avatar'];
  if (bot) classes.push('avatar--bot');
  if (active) classes.push('is-active');
  const initial = [...name.trim()][0]?.toUpperCase() ?? '?';
  return (
    <span className={classes.join(' ')} aria-hidden="true">
      {initial}
    </span>
  );
}
