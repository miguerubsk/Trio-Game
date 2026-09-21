import { useState } from 'react';
import { setSoundEnabled, soundEnabled } from '../sound/player';

/** Enciende y apaga el sonido. Es cosa de cada uno, no de la sala. */
export function SoundToggle() {
  const [on, setOn] = useState(soundEnabled);

  const toggle = () => {
    setSoundEnabled(!on);
    setOn(!on);
  };

  return (
    <button
      type="button"
      className="sound"
      onClick={toggle}
      aria-pressed={on}
      aria-label={on ? 'Quitar el sonido' : 'Poner el sonido'}
      title={on ? 'Quitar el sonido' : 'Poner el sonido'}
    >
      <svg className="icon" viewBox="0 0 20 20" aria-hidden="true">
        <path d="M4.5 7.5h2.5L10.5 4v12L7 12.5H4.5z" />
        {on ? (
          <>
            <path d="M13.5 7.2a4 4 0 0 1 0 5.6" />
            <path d="M15.8 5a7 7 0 0 1 0 10" />
          </>
        ) : (
          <path d="M13.8 7.8l4.4 4.4M18.2 7.8l-4.4 4.4" />
        )}
      </svg>
    </button>
  );
}
