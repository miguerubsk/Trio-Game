export type Value = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
/**
 * Cómo se gana, según el reglamento: tres tríos cualesquiera, o dos tríos
 * conectados. El trío de sietes gana en los dos. Jugar por equipos es una
 * variante aparte que se combina con cualquiera de ellos.
 */
export type GameMode = 'simple' | 'spicy';

export const VALUES: readonly Value[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
export const COPIES_PER_VALUE = 3;
/** El trío de sietes gana la partida al instante. */
export const SEVENS: Value = 7;

/**
 * Tríos conectados del modo picante: los números pequeños de las esquinas de
 * cada carta, copiados de la tabla del reglamento. El 7 no conecta con nada.
 */
export const CONNECTIONS: Readonly<Record<Value, readonly Value[]>> = {
  1: [6, 8],
  2: [5, 9],
  3: [4, 10],
  4: [3, 11],
  5: [2, 12],
  6: [1],
  7: [],
  8: [1],
  9: [2],
  10: [3],
  11: [4],
  12: [5],
};

export const connected = (a: Value, b: Value): boolean => CONNECTIONS[a].includes(b);

/** Tríos que hacen falta para ganar; en picante, además, tienen que estar conectados. */
export const TRIOS_TO_WIN: Readonly<Record<GameMode, number>> = { simple: 3, spicy: 2 };

export interface Card {
  readonly id: number;
  readonly value: Value;
  /** Los números pequeños de la esquina: con qué tríos conecta en el modo picante. */
  readonly secondary: readonly Value[];
}

export interface DealSpec {
  handSize: number;
  centerSize: number;
}

/** Reparto por número de jugadores, tal cual lo da el reglamento. Por equipos no hay centro. */
export const DEAL_TABLE: Readonly<Record<'solo' | 'teams', Readonly<Record<number, DealSpec>>>> = {
  solo: {
    3: { handSize: 9, centerSize: 9 },
    4: { handSize: 7, centerSize: 8 },
    5: { handSize: 6, centerSize: 6 },
    6: { handSize: 5, centerSize: 6 },
  },
  teams: {
    4: { handSize: 9, centerSize: 0 },
    6: { handSize: 6, centerSize: 0 },
  },
};

export function dealSpec(teams: boolean, playerCount: number): DealSpec | null {
  return DEAL_TABLE[teams ? 'teams' : 'solo'][playerCount] ?? null;
}

/** Las 36 cartas sin barajar. */
export function fullDeckValues(): Value[] {
  return VALUES.flatMap((value) => Array<Value>(COPIES_PER_VALUE).fill(value));
}
