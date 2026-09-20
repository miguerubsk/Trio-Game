import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import {
  NAME_MAX_LENGTH,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  type Rng,
} from '@trio/shared';

/** Secreto con el que un jugador recupera su asiento. Solo lo conocen él y el servidor. */
export const newToken = (): string => randomBytes(24).toString('base64url');

/** Identificador público del jugador: sale en todas las vistas, así que no sirve para entrar. */
export const newPlayerId = (): string => randomBytes(6).toString('base64url');

export function newRoomCode(): string {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
  return code;
}

/**
 * RNG criptográfico para barajar. El sembrado del motor (mulberry32) es solo
 * para tests: con 32 bits de estado, una mano bastaría para reconstruir el reparto.
 */
export const cryptoRng: Rng = () => randomInt(2 ** 48 - 1) / 2 ** 48;

export function tokensMatch(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Nombre visible: sin caracteres de control, espacios colapsados y longitud acotada. */
export function normalizeName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  const name = raw.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const length = [...name].length;
  return length >= 1 && length <= NAME_MAX_LENGTH ? name : null;
}

const CODE_PATTERN = new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`);

export function normalizeCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const code = raw.trim().toUpperCase();
  return CODE_PATTERN.test(code) ? code : null;
}
