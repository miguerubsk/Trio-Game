import { describe, expect, it } from 'vitest';
import { CONNECTIONS, connected, DEAL_TABLE, TRIOS_TO_WIN, VALUES } from './cards';
import { mulberry32 } from './rng';
import { createGame } from './setup';

const roster = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `J${i}` }));

describe('reglamento', () => {
  it('la tabla de conexiones es la del reglamento', () => {
    expect(CONNECTIONS).toEqual({
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
    });
  });

  it('dos números conectan si suman 7 o se llevan 7, y siempre en los dos sentidos', () => {
    // Otra forma de leer la misma tabla: si una casilla se copiara mal, aquí no cuadraría.
    for (const a of VALUES) {
      for (const b of VALUES) {
        expect(connected(a, b), `${a} y ${b}`).toBe(a + b === 7 || Math.abs(a - b) === 7);
        expect(connected(a, b)).toBe(connected(b, a));
      }
    }
  });

  it('el 7 no conecta con nada: su trío vale por sí solo', () => {
    expect(VALUES.filter((v) => connected(7, v))).toEqual([]);
  });

  it('el reparto es el del reglamento y usa las 36 cartas', () => {
    expect(DEAL_TABLE.solo).toEqual({
      3: { handSize: 9, centerSize: 9 },
      4: { handSize: 7, centerSize: 8 },
      5: { handSize: 6, centerSize: 6 },
      6: { handSize: 5, centerSize: 6 },
    });
    for (const table of [DEAL_TABLE.solo, DEAL_TABLE.teams]) {
      for (const [n, spec] of Object.entries(table)) {
        expect(Number(n) * spec.handSize + spec.centerSize, `${n} jugadores`).toBe(36);
      }
    }
  });

  it('cada carta lleva en la esquina sus conexiones', () => {
    const s = createGame({ players: roster(3), mode: 'spicy', rng: mulberry32(1) });
    for (const card of s.cards) expect(card.secondary).toEqual(CONNECTIONS[card.value]);
  });

  it('en sencillo hacen falta tres tríos; en picante, dos', () => {
    expect(TRIOS_TO_WIN).toEqual({ simple: 3, spicy: 2 });
    const spicy = createGame({ players: roster(4), mode: 'spicy', teams: true, rng: mulberry32(1) });
    expect(spicy.config).toEqual({ mode: 'spicy', teams: true, targetTrios: 2 });
  });
});
