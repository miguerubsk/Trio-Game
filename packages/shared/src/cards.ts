export type Value = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
export type GameMode = 'simple' | 'teams';

export const VALUES: readonly Value[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
export const COPIES_PER_VALUE = 3;
/** El trío de sietes gana la partida al instante. */
export const SEVENS: Value = 7;

export interface Card {
  readonly id: number;
  readonly value: Value;
  /** Números pequeños de la esquina. Reservado para el modo Picante: vacío en v1. */
  readonly secondary: readonly number[];
}

export interface DealSpec {
  handSize: number;
  centerSize: number;
}

/** Reparto por modo y número de jugadores. Contrastar con el reglamento físico. */
export const DEAL_TABLE: Record<GameMode, Readonly<Record<number, DealSpec>>> = {
  simple: {
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

export function dealSpec(mode: GameMode, playerCount: number): DealSpec | null {
  return DEAL_TABLE[mode][playerCount] ?? null;
}

/** Las 36 cartas sin barajar. */
export function fullDeckValues(): Value[] {
  return VALUES.flatMap((value) => Array<Value>(COPIES_PER_VALUE).fill(value));
}
