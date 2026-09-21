import type { Session } from '@trio/shared';

const SESSION_KEY = 'trio.session';
const NAME_KEY = 'trio.name';
const SOUND_KEY = 'trio.sound';

/** En modo privado o con el almacenamiento bloqueado, leer o escribir lanza. */
function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Sin almacenamiento se sigue jugando; solo se pierde la reconexión.
  }
}

export function loadSession(): Session | null {
  const raw = read(SESSION_KEY);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<Session>;
    const { code, playerId, token } = value;
    if (typeof code !== 'string' || typeof playerId !== 'string' || typeof token !== 'string') return null;
    return { code, playerId, token };
  } catch {
    return null;
  }
}

export const saveSession = (session: Session | null): void =>
  write(SESSION_KEY, session && JSON.stringify(session));

export const loadName = (): string => read(NAME_KEY) ?? '';
export const saveName = (name: string): void => write(NAME_KEY, name);

/** El sonido viene puesto; quien lo apaga, lo tiene apagado la próxima vez. */
export const loadSound = (): boolean => read(SOUND_KEY) !== 'off';
export const saveSound = (on: boolean): void => write(SOUND_KEY, on ? 'on' : 'off');
