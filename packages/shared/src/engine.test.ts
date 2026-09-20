import { describe, expect, it } from 'vitest';
import { applyAction, skipTurn } from './engine';
import { legalActions } from './legal';
import { ask, CONFIRM, handValues, must, reveal, stateFromLayout } from './testing';
import type { Action } from './types';

describe('turno: fallo', () => {
  const start = () =>
    stateFromLayout({ hands: [[3, 5, 9], [1, 4, 4], [2, 6, 8]], center: [10, 11, 12] });

  it('dos cartas distintas congelan el tablero hasta el «continuar» del jugador activo', () => {
    const s = must(must(start(), 'p0', reveal(0)), 'p0', ask('p1', 'lowest'));
    expect(s.phase).toBe('awaitingReturn');
    expect(s.outcome).toBe('mismatch');
    expect(s.revealed).toHaveLength(2);

    expect(applyAction(s, 'p0', reveal(1))).toEqual({ ok: false, error: 'WRONG_PHASE' });
    expect(applyAction(s, 'p1', CONFIRM)).toEqual({ ok: false, error: 'NOT_YOUR_TURN' });
    expect(legalActions(s, 'p0')).toMatchObject({ confirm: true, reveal: null });
    expect(legalActions(s, 'p1')).toMatchObject({ confirm: false, reveal: null });
  });

  it('al confirmar, todo vuelve a su sitio y el turno pasa al siguiente', () => {
    const before = start();
    const s = must(must(must(before, 'p0', reveal(0)), 'p0', ask('p1', 'lowest')), 'p0', CONFIRM);
    expect(s.phase).toBe('awaitingReveal');
    expect(s.revealed).toEqual([]);
    expect(s.currentPlayerIndex).toBe(1);
    expect(s.center).toEqual(before.center);
    expect(s.hands).toEqual(before.hands);
  });

  it('solo el jugador activo puede revelar', () => {
    expect(applyAction(start(), 'p1', reveal(0))).toEqual({ ok: false, error: 'NOT_YOUR_TURN' });
  });

  it('con dos cartas iguales el turno sigue y la tercera que no casa devuelve las tres', () => {
    const before = stateFromLayout({
      hands: [[4, 8, 9], [4, 5, 6], [2, 3, 12]],
      center: [9, 10, 11],
    });
    let s = must(must(before, 'p0', ask('p0', 'lowest')), 'p0', ask('p1', 'lowest'));
    expect(s.phase).toBe('awaitingReveal');
    expect(s.revealed).toHaveLength(2);

    s = must(s, 'p0', reveal(0));
    expect(s.phase).toBe('awaitingReturn');
    expect(s.outcome).toBe('mismatch');
    expect(s.revealed).toHaveLength(3);

    s = must(s, 'p0', CONFIRM);
    expect(s.hands).toEqual(before.hands);
    expect(s.center).toEqual(before.center);
    expect(s.trios['p0']).toEqual([]);
    expect(s.currentPlayerIndex).toBe(1);
  });
});

describe('turno: trío', () => {
  const layout = () =>
    stateFromLayout({ hands: [[4, 8, 9], [4, 5, 6], [2, 3, 12]], center: [4, 10, 11] });

  const formTrio = () =>
    must(
      must(must(layout(), 'p0', ask('p0', 'lowest')), 'p0', ask('p1', 'lowest')),
      'p0',
      reveal(0),
    );

  it('las tres cartas se quedan boca arriba hasta que el jugador activo confirma', () => {
    const s = formTrio();
    expect(s.phase).toBe('awaitingReturn');
    expect(s.outcome).toBe('trio');
    expect(s.revealed).toHaveLength(3);
    expect(s.trios['p0']).toEqual([]);
    expect(s.center[0]).not.toBeNull();
  });

  it('al confirmar se retira el trío y el turno pasa al siguiente jugador', () => {
    const s = must(formTrio(), 'p0', CONFIRM);
    expect(s.trios['p0']).toEqual([4]);
    expect(handValues(s, 'p0')).toEqual([8, 9]);
    expect(handValues(s, 'p1')).toEqual([5, 6]);
    expect(s.center.map((slot) => slot === null)).toEqual([true, false, false]);
    expect(s.phase).toBe('awaitingReveal');
    expect(s.currentPlayerIndex).toBe(1);
  });

  it('un hueco del centro ya retirado no se puede volver a voltear', () => {
    const s = must(formTrio(), 'p0', CONFIRM);
    expect(applyAction(s, 'p1', reveal(0))).toEqual({ ok: false, error: 'SLOT_EMPTY' });
    expect(legalActions(s, 'p1').reveal?.centerSlots).toEqual([1, 2]);
  });

  it('las tres cartas pueden salir de una misma mano', () => {
    const start = stateFromLayout({ hands: [[9, 10, 11], [4, 4, 4], [6, 8, 12]] });
    let s = must(start, 'p0', ask('p1', 'lowest'));
    s = must(s, 'p0', ask('p1', 'highest'));
    s = must(s, 'p0', ask('p1', 'lowest'));
    expect(s.outcome).toBe('trio');

    s = must(s, 'p0', CONFIRM);
    expect(s.trios['p0']).toEqual([4]);
    expect(handValues(s, 'p1')).toEqual([]);
    expect(legalActions(s, 'p1').reveal?.targets).toEqual(['p0', 'p2']);
  });
});

describe('carta más baja y más alta', () => {
  const start = () => stateFromLayout({ hands: [[9, 10, 11], [2, 3, 5], [6, 8, 12]] });

  it('pedir dos veces «la más baja» da la siguiente carta oculta', () => {
    const first = applyAction(start(), 'p0', ask('p1', 'lowest'));
    if (!first.ok) throw new Error(first.error);
    expect(first.events[0]).toMatchObject({
      type: 'reveal',
      value: 2,
      from: { kind: 'hand', playerId: 'p1', index: 0 },
    });

    const second = applyAction(first.state, 'p0', ask('p1', 'lowest'));
    if (!second.ok) throw new Error(second.error);
    expect(second.events[0]).toMatchObject({
      type: 'reveal',
      value: 3,
      from: { kind: 'hand', playerId: 'p1', index: 1 },
    });
  });

  it('lo mismo con «la más alta»', () => {
    const first = must(start(), 'p0', ask('p1', 'highest'));
    const second = applyAction(first, 'p0', ask('p1', 'highest'));
    if (!second.ok) throw new Error(second.error);
    expect(second.events[0]).toMatchObject({
      value: 3,
      from: { kind: 'hand', playerId: 'p1', index: 1 },
    });
  });

  it('una mano sin cartas ocultas ya no es objetivo válido', () => {
    const s = must(stateFromLayout({ hands: [[9, 10, 11], [2], [6, 8, 12]] }), 'p0', ask('p1', 'lowest'));
    expect(applyAction(s, 'p0', ask('p1', 'highest'))).toEqual({
      ok: false,
      error: 'NO_HIDDEN_CARDS',
    });
    expect(legalActions(s, 'p0').reveal?.targets).toEqual(['p0', 'p2']);
  });

  it('se puede pedir la propia carta', () => {
    const s = must(start(), 'p0', ask('p0', 'highest'));
    expect(s.revealed[0]?.origin).toEqual({ kind: 'hand', playerId: 'p0' });
  });
});

describe('victoria', () => {
  const sevens = () =>
    stateFromLayout({ hands: [[1, 2, 7], [3, 4, 7], [5, 6, 12]], center: [7, 10, 11] });

  it('el trío de sietes gana al instante, sin esperar el «continuar»', () => {
    let s = must(sevens(), 'p0', ask('p0', 'highest'));
    s = must(s, 'p0', ask('p1', 'highest'));
    s = must(s, 'p0', reveal(0));
    expect(s.phase).toBe('finished');
    expect(s.winner).toEqual({ playerIds: ['p0'], team: null, reason: 'sevens' });
    expect(s.trios['p0']).toEqual([7]);
    expect(applyAction(s, 'p1', reveal(1))).toEqual({ ok: false, error: 'GAME_OVER' });
  });

  const threes = () =>
    stateFromLayout({ hands: [[3, 8, 9], [3, 5, 6], [2, 4, 12]], center: [3, 10, 11] });
  const formThrees = (previous: number[]) => {
    const s = threes();
    s.trios['p0'] = previous as never;
    return must(must(must(s, 'p0', ask('p0', 'lowest')), 'p0', ask('p1', 'lowest')), 'p0', reveal(0));
  };

  it('el tercer trío gana la partida', () => {
    const s = formThrees([1, 2]);
    expect(s.phase).toBe('finished');
    expect(s.winner).toEqual({ playerIds: ['p0'], team: null, reason: 'trios' });
    expect(s.trios['p0']).toEqual([1, 2, 3]);
  });

  it('el segundo trío no gana todavía', () => {
    const s = formThrees([1]);
    expect(s.phase).toBe('awaitingReturn');
    expect(s.winner).toBeNull();
  });
});

describe('validación', () => {
  const start = () =>
    stateFromLayout({ hands: [[3, 5, 9], [1, 4, 4], [2, 6, 8]], center: [10, 11, 12] });

  it.each([-1, 3, 1.5, Number.NaN])('rechaza el hueco %s del centro', (slot) => {
    expect(applyAction(start(), 'p0', reveal(slot))).toEqual({ ok: false, error: 'INVALID_SLOT' });
  });

  it('rechaza voltear dos veces el mismo hueco', () => {
    const s = must(start(), 'p0', reveal(0));
    expect(applyAction(s, 'p0', reveal(0))).toEqual({ ok: false, error: 'ALREADY_REVEALED' });
  });

  it('rechaza objetivos y extremos que no existen', () => {
    expect(applyAction(start(), 'p0', ask('nadie', 'lowest'))).toEqual({
      ok: false,
      error: 'INVALID_TARGET',
    });
    expect(applyAction(start(), 'p0', ask('p1', 'middle' as never))).toEqual({
      ok: false,
      error: 'INVALID_END',
    });
  });

  it('rechaza jugadores y acciones desconocidos', () => {
    expect(applyAction(start(), 'fantasma', reveal(0))).toEqual({
      ok: false,
      error: 'UNKNOWN_PLAYER',
    });
    expect(applyAction(start(), 'p0', { type: 'HACK' } as unknown as Action)).toEqual({
      ok: false,
      error: 'UNKNOWN_ACTION',
    });
    expect(applyAction(start(), 'p0', null as unknown as Action)).toEqual({
      ok: false,
      error: 'UNKNOWN_ACTION',
    });
  });

  it('no muta el estado que recibe, ni siquiera al rechazar', () => {
    const s = start();
    const snapshot = JSON.stringify(s);
    applyAction(s, 'p0', reveal(0));
    applyAction(s, 'p1', reveal(0));
    expect(JSON.stringify(s)).toBe(snapshot);
  });

  it('sin centro (modo por equipos) no hay huecos que voltear', () => {
    const s = stateFromLayout({ mode: 'teams', hands: [[1], [2], [3], [4]] });
    expect(applyAction(s, 'p0', reveal(0))).toEqual({ ok: false, error: 'INVALID_SLOT' });
  });
});

describe('saltar turno (jugador expulsado)', () => {
  const start = () =>
    stateFromLayout({ hands: [[4, 8, 9], [4, 5, 6], [2, 3, 12]], center: [9, 10, 11] });

  it('pasa el turno al siguiente sin tocar el tablero', () => {
    const before = start();
    const result = skipTurn(before);
    if (!result.ok) throw new Error(result.error);
    expect(result.state.currentPlayerIndex).toBe(1);
    expect(result.state.phase).toBe('awaitingReveal');
    expect(result.state.hands).toEqual(before.hands);
    expect(result.events).toEqual([
      { type: 'skip', playerId: 'p0' },
      { type: 'turn', playerId: 'p1' },
    ]);
  });

  it('a mitad de jugada, las cartas volteadas vuelven a su sitio', () => {
    const before = start();
    const mid = must(must(before, 'p0', ask('p0', 'lowest')), 'p0', ask('p1', 'lowest'));
    expect(mid.revealed).toHaveLength(2);

    const result = skipTurn(mid);
    if (!result.ok) throw new Error(result.error);
    expect(result.state.revealed).toEqual([]);
    expect(result.state.hands).toEqual(before.hands);
    expect(result.state.center).toEqual(before.center);
    expect(result.state.trios['p0']).toEqual([]);
    expect(result.events[0]).toEqual({ type: 'return', by: 'p0' });
  });

  it('solo mientras se espera una revelación', () => {
    const settled = must(must(start(), 'p0', reveal(0)), 'p0', ask('p1', 'lowest'));
    expect(skipTurn(settled)).toEqual({ ok: false, error: 'WRONG_PHASE' });
  });

  it('no muta el estado que recibe', () => {
    const s = must(start(), 'p0', reveal(0));
    const snapshot = JSON.stringify(s);
    skipTurn(s);
    expect(JSON.stringify(s)).toBe(snapshot);
  });
});
