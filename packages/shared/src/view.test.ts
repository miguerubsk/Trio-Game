import { describe, expect, it } from 'vitest';
import type { Value } from './cards';
import { handOf } from './helpers';
import { mulberry32 } from './rng';
import { createGame } from './setup';
import { ask, choose, CONFIRM, handValues, must, reveal, stateFromLayout } from './testing';
import type { GameState, PlayerId } from './types';
import { buildView, type PlayerView } from './view';

/** Un valor imposible: si aparece en una vista, es que se ha filtrado una carta. */
const SECRET = 777 as Value;
const LEAK = /\b777\b/;

const roster = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `J${i}` }));

/** Copia del estado donde toda carta que `viewer` no puede conocer vale SECRET. */
function withSecrets(s: GameState, viewer: PlayerId): GameState {
  const copy = JSON.parse(JSON.stringify(s)) as GameState;
  const known = new Set<number>([...handOf(copy, viewer), ...copy.revealed.map((r) => r.cardId)]);
  // La esquina delata el número (el 1 conecta con 6 y 8…): también es secreta.
  copy.cards = copy.cards.map((c) => (known.has(c.id) ? c : { ...c, value: SECRET, secondary: [SECRET] }));
  return copy;
}

const leaks = (s: GameState, viewer: PlayerId) =>
  LEAK.test(JSON.stringify(buildView(withSecrets(s, viewer), viewer)));

/** Partida con dos cartas ya volteadas: una del centro y otra de la mano de otro jugador. */
function midTurn(teams = false, players = 4): GameState {
  let s = createGame({ players: roster(players), mode: 'simple', teams, rng: mulberry32(21) });
  if (s.phase === 'teamSwap') {
    for (const p of s.players) s = must(s, p.id, { type: 'SWAP_PASS' });
  }
  const active = s.players[s.currentPlayerIndex]?.id as PlayerId;
  const other = s.players.find((p) => p.id !== active)?.id as PlayerId;
  if (!teams) s = must(s, active, reveal(0));
  else s = must(s, active, ask(active, 'lowest'));
  return must(s, active, ask(other, 'highest'));
}

describe('redacción de la vista', () => {
  it('ningún jugador recibe el valor de una carta que no puede ver (sencillo)', () => {
    const s = midTurn(false, 4);
    for (const p of s.players) expect(leaks(s, p.id), `vista de ${p.id}`).toBe(false);
  });

  it('ningún jugador recibe el valor de una carta que no puede ver (equipos)', () => {
    const s = midTurn(true, 6);
    for (const p of s.players) expect(leaks(s, p.id), `vista de ${p.id}`).toBe(false);
  });

  it('desde el primer instante, antes de voltear nada', () => {
    const s = createGame({ players: roster(5), mode: 'simple', rng: mulberry32(3) });
    for (const p of s.players) expect(leaks(s, p.id), `vista de ${p.id}`).toBe(false);
  });

  it('la prueba detecta fugas: la mano propia sí contiene los valores', () => {
    // Si esta comprobación fallara, «no hay fugas» de arriba sería una prueba vacía.
    const s = midTurn(false, 4);
    expect(LEAK.test(JSON.stringify(buildView(withSecrets(s, 'p1'), 'p0')))).toBe(true);
  });

  it('las cartas boca arriba son públicas y se ven con su valor', () => {
    const s = midTurn(false, 4);
    const trueValues = s.revealed.map((r) => s.cards[r.cardId]?.value);
    for (const p of s.players) {
      const view = buildView(s, p.id);
      expect(view.revealed.map((r) => r.value)).toEqual(trueValues);
      expect(view.center[0]).toEqual({ state: 'up', value: trueValues[0] });
    }
  });

  it('una carta oculta ni siquiera lleva el campo valor', () => {
    const s = midTurn(false, 4);
    const view = buildView(s, 'p0');
    for (const slot of view.center) if (slot.state !== 'up') expect('value' in slot).toBe(false);
    for (const p of view.players) {
      for (const slot of p.hand) if (!slot.faceUp) expect('value' in slot).toBe(false);
    }
  });

  it('la parte pública es idéntica para todos los jugadores', () => {
    const s = midTurn(false, 4);
    const views = s.players.map((p) => buildView(s, p.id));
    const [first, ...rest] = views;
    for (const v of rest) {
      expect(v.players).toEqual(first?.players);
      expect(v.center).toEqual(first?.center);
      expect(v.revealed).toEqual(first?.revealed);
      expect(v.log).toEqual(first?.log);
      expect(v.phase).toBe(first?.phase);
      expect(v.currentPlayerId).toBe(first?.currentPlayerId);
    }
  });

  it('cada jugador ve su propia mano completa, ordenada y alineada con la de la mesa', () => {
    const s = midTurn(false, 4);
    for (const p of s.players) {
      const view = buildView(s, p.id);
      expect(view.myHand.map((c) => c.value)).toEqual(handValues(s, p.id));
      expect(view.myHand).toHaveLength(view.players.find((q) => q.id === p.id)?.hand.length ?? -1);
    }
  });

  it('el número de cartas de cada mano es público', () => {
    const s = createGame({ players: roster(3), mode: 'simple', rng: mulberry32(2) });
    const view = buildView(s, 'p0');
    expect(view.players.map((p) => p.hand.length)).toEqual([9, 9, 9]);
    expect(view.center).toHaveLength(9);
  });

  it('un jugador que no existe no obtiene vista', () => {
    const s = createGame({ players: roster(3), mode: 'simple', rng: mulberry32(2) });
    expect(() => buildView(s, 'intruso')).toThrow();
  });
});

describe('redacción de los intercambios', () => {
  const fresh = () => createGame({ players: roster(4), mode: 'simple', teams: true, rng: mulberry32(5) });

  it('no se sabe qué carta ha elegido el compañero, solo que ha respondido', () => {
    const s = must(fresh(), 'p0', choose(3));

    const partner = buildView(s, 'p2');
    expect(partner.swap?.myResponse).toBeNull();
    expect(partner.swap?.teams[0]?.responded).toEqual({ p0: true, p2: false });

    const rival = buildView(s, 'p1');
    expect(rival.swap?.myResponse).toBeNull();
    expect(rival.swap?.teams[0]?.responded).toEqual({ p0: true, p2: false });

    expect(buildView(s, 'p0').swap?.myResponse).toBe(3);
  });

  it('nadie recibe valores ocultos durante el intercambio', () => {
    const s = must(fresh(), 'p0', choose(3));
    for (const p of s.players) expect(leaks(s, p.id), `vista de ${p.id}`).toBe(false);
  });
});

describe('vista al terminar', () => {
  it('incluye al ganador y sigue sin filtrar cartas ocultas', () => {
    const s0 = stateFromLayout({
      hands: [[1, 2, 7], [3, 4, 7], [5, 6, 12]],
      center: [7, 10, 11],
    });
    let s = must(s0, 'p0', ask('p0', 'highest'));
    s = must(s, 'p0', ask('p1', 'highest'));
    s = must(s, 'p0', reveal(0));

    const view = buildView(s, 'p2');
    expect(view.phase).toBe('finished');
    expect(view.winner).toEqual({ playerIds: ['p0'], team: null, reason: 'sevens' });
    expect(view.players[0]?.trios).toEqual([7]);
    expect(view.legal).toEqual({ reveal: null, confirm: false, swap: null });
    expect(leaks(s, 'p2')).toBe(false);
  });
});

describe('registro de jugadas', () => {
  const reveals = (view: PlayerView) => view.log.filter((e) => e.type === 'reveal');

  const mismatch = () => {
    const s0 = stateFromLayout({ hands: [[3, 5, 9], [1, 4, 4], [2, 6, 8]], center: [10, 11, 12] });
    return must(must(s0, 'p0', reveal(0)), 'p0', ask('p1', 'lowest'));
  };

  it('mientras las cartas siguen boca arriba, el registro lleva su valor', () => {
    for (const viewer of ['p0', 'p1', 'p2']) {
      expect(reveals(buildView(mismatch(), viewer)).map((e) => 'value' in e && e.value)).toEqual([10, 1]);
    }
  });

  it('cuando vuelven boca abajo, dice quién volteó y de dónde, pero no el valor', () => {
    const s = must(mismatch(), 'p0', CONFIRM);
    for (const viewer of ['p0', 'p1', 'p2']) {
      expect(reveals(buildView(s, viewer))).toEqual([
        { type: 'reveal', by: 'p0', from: { kind: 'center', slot: 0 } },
        { type: 'reveal', by: 'p0', from: { kind: 'hand', playerId: 'p1', index: 0 } },
      ]);
    }
  });

  it('en la jugada siguiente solo se ven los valores de la jugada en curso', () => {
    const s = must(must(mismatch(), 'p0', CONFIRM), 'p1', ask('p2', 'highest'));
    const shown = reveals(buildView(s, 'p2')).map((e) => ('value' in e ? e.value : null));
    expect(shown).toEqual([null, null, 8]);
  });

  it('los tríos conservan su valor', () => {
    const s0 = stateFromLayout({ hands: [[4, 8, 9], [4, 5, 6], [2, 3, 12]], center: [4, 10, 11] });
    let s = must(must(must(s0, 'p0', ask('p0', 'lowest')), 'p0', ask('p1', 'lowest')), 'p0', reveal(0));
    s = must(s, 'p0', CONFIRM);
    const log = buildView(s, 'p1').log;
    expect(log.filter((e) => e.type === 'reveal').every((e) => !('value' in e))).toBe(true);
    expect(log).toContainEqual({ type: 'trio', by: 'p0', value: 4 });
    expect(log).toContainEqual({ type: 'collect', by: 'p0', value: 4 });
  });
});
