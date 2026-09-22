import { describe, expect, it } from 'vitest';
import { dealSpec, fullDeckValues, type Value } from './cards';
import { applyAction } from './engine';
import { legalActions } from './legal';
import { mulberry32 } from './rng';
import { createGame } from './setup';
import {
  ask,
  choose,
  CONFIRM,
  handValues,
  must,
  PASS,
  reveal,
  stateFromLayout,
} from './testing';

const roster = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `J${i}` }));
const sorted = (values: number[]) => [...values].sort((a, b) => a - b);

describe('reparto', () => {
  const combos: [string, boolean, number][] = [
    ['individual', false, 3],
    ['individual', false, 4],
    ['individual', false, 5],
    ['individual', false, 6],
    ['por equipos', true, 4],
    ['por equipos', true, 6],
  ];

  it.each(combos)('%s con %i jugadores reparte las 36 cartas sin repetir', (_label, teams, n) => {
    const s = createGame({ players: roster(n), mode: 'simple', teams, rng: mulberry32(n) });
    const spec = dealSpec(teams, n);
    expect(spec).toBeDefined();

    for (const p of s.players) expect(s.hands[p.id]).toHaveLength(spec?.handSize ?? -1);
    expect(s.center).toHaveLength(spec?.centerSize ?? -1);

    const ids = [...Object.values(s.hands).flat(), ...s.center];
    expect(ids).toHaveLength(36);
    expect(new Set(ids).size).toBe(36);
    expect(sorted(s.cards.map((c) => c.value))).toEqual(fullDeckValues());
  });

  it.each(combos)('%s con %i jugadores: manos ordenadas de menor a mayor', (_label, teams, n) => {
    const s = createGame({ players: roster(n), mode: 'simple', teams, rng: mulberry32(100 + n) });
    for (const p of s.players) {
      const values = handValues(s, p.id);
      expect(values).toEqual(sorted(values));
    }
  });

  it('los ids no delatan el valor: no salen en el orden de la baraja sin barajar', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const s = createGame({ players: roster(3), mode: 'simple', rng: mulberry32(seed) });
      expect(s.cards.map((c) => c.value)).not.toEqual(fullDeckValues());
    }
  });

  it('es reproducible con la misma semilla y distinto con otra', () => {
    const make = (seed: number) =>
      JSON.stringify(createGame({ players: roster(4), mode: 'simple', rng: mulberry32(seed) }));
    expect(make(9)).toBe(make(9));
    expect(make(9)).not.toBe(make(10));
  });

  it('el jugador inicial es uno de los asientos', () => {
    for (let seed = 0; seed < 20; seed++) {
      const s = createGame({ players: roster(5), mode: 'simple', rng: mulberry32(seed) });
      expect(s.currentPlayerIndex).toBeGreaterThanOrEqual(0);
      expect(s.currentPlayerIndex).toBeLessThan(5);
      expect(s.phase).toBe('awaitingReveal');
    }
  });

  it.each<[string, boolean, number]>([
    ['individual', false, 2],
    ['individual', false, 7],
    ['por equipos', true, 3],
    ['por equipos', true, 5],
  ])('rechaza %s con %i jugadores', (_label, teams, n) => {
    expect(() => createGame({ players: roster(n), mode: 'simple', teams, rng: mulberry32(1) })).toThrow();
  });

  it('rechaza ids de jugador repetidos', () => {
    const players = [{ id: 'a', name: 'A' }, { id: 'a', name: 'B' }, { id: 'c', name: 'C' }];
    expect(() => createGame({ players, mode: 'simple', rng: mulberry32(1) })).toThrow();
  });
});

describe('equipos: asientos', () => {
  it('los compañeros se sientan alternados', () => {
    const four = createGame({ players: roster(4), mode: 'simple', teams: true, rng: mulberry32(1) });
    expect(four.players.map((p) => p.team)).toEqual([0, 1, 0, 1]);
    const six = createGame({ players: roster(6), mode: 'simple', teams: true, rng: mulberry32(1) });
    expect(six.players.map((p) => p.team)).toEqual([0, 1, 2, 0, 1, 2]);
  });

  it('fuera de equipos nadie tiene equipo', () => {
    const s = createGame({ players: roster(4), mode: 'simple', rng: mulberry32(1) });
    expect(s.players.map((p) => p.team)).toEqual([null, null, null, null]);
  });
});

describe('equipos: intercambio inicial', () => {
  const fresh = () => createGame({ players: roster(4), mode: 'simple', teams: true, rng: mulberry32(11) });

  it('arranca con una ronda de intercambio para todas las parejas', () => {
    const s = fresh();
    expect(s.phase).toBe('teamSwap');
    expect(s.swap?.reason).toBe('start');
    expect(s.swap?.teams.map((t) => t.team)).toEqual([0, 1]);
    expect(legalActions(s, 'p0')).toEqual({ reveal: null, confirm: false, swap: { handSize: 9 } });
    expect(applyAction(s, 'p0', reveal(0))).toEqual({ ok: false, error: 'WRONG_PHASE' });
  });

  it('dos compañeros que eligen carta se las intercambian', () => {
    const s0 = fresh();
    const p0 = handValues(s0, 'p0');
    const p2 = handValues(s0, 'p2');

    let s = must(s0, 'p0', choose(0));
    expect(handValues(s, 'p0')).toEqual(p0); // hasta que responda el compañero no pasa nada
    s = must(s, 'p2', choose(8));

    expect(handValues(s, 'p0')).toEqual(sorted([...p0.slice(1), p2[8] as Value]));
    expect(handValues(s, 'p2')).toEqual(sorted([...p2.slice(0, 8), p0[0] as Value]));
    expect(s.phase).toBe('teamSwap'); // falta la otra pareja
    expect(legalActions(s, 'p0').swap).toBeNull();
  });

  it('si uno de los dos pasa no hay intercambio y arranca la partida', () => {
    const s0 = fresh();
    let s = must(s0, 'p0', choose(0));
    s = must(s, 'p2', PASS);
    s = must(s, 'p1', PASS);
    s = must(s, 'p3', choose(0));

    expect(s.phase).toBe('awaitingReveal');
    expect(s.swap).toBeNull();
    expect(s.hands).toEqual(s0.hands);
    expect(s.log.map((e) => e.type)).toEqual([
      'swapRequested',
      'swapResolved',
      'swapResolved',
      'turn',
    ]);
    expect(s.log.filter((e) => e.type === 'swapResolved')).toEqual([
      { type: 'swapResolved', team: 0, swapped: false },
      { type: 'swapResolved', team: 1, swapped: false },
    ]);
    expect(applyAction(s, 'p0', PASS)).toEqual({ ok: false, error: 'WRONG_PHASE' });
  });

  it('no se puede responder dos veces', () => {
    const s = must(fresh(), 'p0', choose(0));
    expect(applyAction(s, 'p0', choose(1))).toEqual({ ok: false, error: 'ALREADY_RESPONDED' });
    expect(applyAction(s, 'p0', PASS)).toEqual({ ok: false, error: 'ALREADY_RESPONDED' });
  });

  it.each([-1, 9, 1.5, Number.NaN])('rechaza el índice %s de una mano de 9 cartas', (i) => {
    expect(applyAction(fresh(), 'p0', choose(i))).toEqual({ ok: false, error: 'INVALID_INDEX' });
  });

  it('una pareja ya resuelta no puede volver a responder', () => {
    const s = must(must(fresh(), 'p0', PASS), 'p2', PASS);
    expect(applyAction(s, 'p0', PASS)).toEqual({ ok: false, error: 'NOT_IN_SWAP' });
  });
});

describe('equipos: intercambio tras un trío', () => {
  const layout = () =>
    stateFromLayout({
      teams: true,
      hands: [[4, 8, 9], [4, 5, 6], [4, 7, 12], [1, 2, 3]],
    });
  const formTrio = (s = layout()) =>
    must(must(must(s, 'p0', ask('p0', 'lowest')), 'p0', ask('p1', 'lowest')), 'p0', ask('p2', 'lowest'));

  it('solo los equipos rivales pueden intercambiar, y el turno pasa al siguiente', () => {
    let s = must(formTrio(), 'p0', CONFIRM);
    expect(s.trios['p0']).toEqual([4]);
    expect(s.phase).toBe('teamSwap');
    expect(s.swap?.reason).toBe('trio');
    expect(s.swap?.teams.map((t) => t.team)).toEqual([1]);
    expect(s.currentPlayerIndex).toBe(1);

    expect(applyAction(s, 'p0', choose(0))).toEqual({ ok: false, error: 'NOT_IN_SWAP' });
    expect(applyAction(s, 'p2', PASS)).toEqual({ ok: false, error: 'NOT_IN_SWAP' });
    expect(legalActions(s, 'p1').swap).toEqual({ handSize: 2 });
    expect(legalActions(s, 'p3').swap).toEqual({ handSize: 3 });

    s = must(must(s, 'p1', choose(0)), 'p3', choose(2));
    expect(handValues(s, 'p1')).toEqual([3, 6]);
    expect(handValues(s, 'p3')).toEqual([1, 2, 5]);
    expect(s.phase).toBe('awaitingReveal');
    expect(s.currentPlayerIndex).toBe(1);
  });

  it('tras un fallo no hay intercambio', () => {
    const s = must(
      must(must(layout(), 'p0', ask('p0', 'lowest')), 'p0', ask('p3', 'lowest')),
      'p0',
      CONFIRM,
    );
    expect(s.phase).toBe('awaitingReveal');
    expect(s.swap).toBeNull();
    expect(s.currentPlayerIndex).toBe(1);
  });

  it('a seis jugadores intercambian los otros dos equipos', () => {
    const six = stateFromLayout({
      teams: true,
      hands: [[4, 8, 9], [4, 5, 6], [4, 7, 12], [1, 2, 3], [1, 2, 3], [1, 2, 3]],
    });
    let s = must(formTrio(six), 'p0', CONFIRM);
    expect(s.swap?.teams.map((t) => t.team)).toEqual([1, 2]);
    expect(applyAction(s, 'p3', PASS)).toEqual({ ok: false, error: 'NOT_IN_SWAP' });

    for (const id of ['p1', 'p4', 'p2', 'p5']) s = must(s, id, PASS);
    expect(s.phase).toBe('awaitingReveal');
    expect(s.currentPlayerIndex).toBe(1);
  });

  it('una pareja con un miembro sin cartas se salta sola', () => {
    const s0 = stateFromLayout({ teams: true, hands: [[4, 8, 9], [4, 5, 6], [4, 7, 12], []] });
    const s = must(formTrio(s0), 'p0', CONFIRM);
    expect(s.phase).toBe('awaitingReveal');
    expect(s.swap).toBeNull();
    expect(s.log.filter((e) => e.type === 'swapResolved')).toEqual([
      { type: 'swapResolved', team: 1, swapped: false },
    ]);
  });
});

describe('equipos: victoria', () => {
  const layout = () =>
    stateFromLayout({
      teams: true,
      hands: [[4, 8, 9], [4, 5, 6], [4, 7, 12], [1, 2, 3]],
    });
  const formTrio = (s: ReturnType<typeof layout>) =>
    must(must(must(s, 'p0', ask('p0', 'lowest')), 'p0', ask('p1', 'lowest')), 'p0', ask('p2', 'lowest'));

  it('los tríos de los dos compañeros se suman', () => {
    const s0 = layout();
    s0.trios['p2'] = [10, 11];
    const s = formTrio(s0);
    expect(s.phase).toBe('finished');
    expect(s.winner).toEqual({ playerIds: ['p0', 'p2'], team: 0, reason: 'trios' });
  });

  it('los tríos de los rivales no cuentan', () => {
    const s0 = layout();
    s0.trios['p1'] = [10, 11];
    expect(formTrio(s0).phase).toBe('awaitingReturn');
  });

  it('el trío de sietes gana para todo el equipo', () => {
    const s0 = stateFromLayout({
      teams: true,
      hands: [[1, 2, 7], [3, 4, 7], [5, 6, 7], [8, 9, 10]],
    });
    let s = must(s0, 'p0', ask('p0', 'highest'));
    s = must(s, 'p0', ask('p1', 'highest'));
    s = must(s, 'p0', ask('p2', 'highest'));
    expect(s.phase).toBe('finished');
    expect(s.winner).toEqual({ playerIds: ['p0', 'p2'], team: 0, reason: 'sevens' });
  });
});
