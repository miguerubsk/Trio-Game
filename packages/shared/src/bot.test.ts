import { describe, expect, it } from 'vitest';
import { createBot, type Bot, type BotLevel } from './bot';
import type { GameMode, Value } from './cards';
import { applyAction } from './engine';
import { handOf, valueOf } from './helpers';
import { legalActions } from './legal';
import { mulberry32 } from './rng';
import { createGame } from './setup';
import { ask, must, reveal, stateFromLayout } from './testing';
import type { CardId, GameState, PlayerId } from './types';
import { buildView } from './view';

const roster = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `J${i}` }));

const canPlay = (s: GameState, id: PlayerId) => {
  const legal = legalActions(s, id);
  return legal.reveal !== null || legal.confirm || legal.swap !== null;
};

interface Table {
  state: GameState;
  bots: Map<PlayerId, Bot>;
  /** Mirones que ven lo mismo que p0 pero no juegan: para comparar niveles. */
  watchers: Bot[];
  /** Cartas que se han volteado delante de todos en algún momento. */
  seen: Set<CardId>;
  steps: number;
}

/** Una mesa donde juegan solo bots, hablando con el motor como haría el servidor. */
function table(state: GameState, level: BotLevel = 'hard', seed = 1, watchers: Bot[] = []): Table {
  const bots = new Map(state.players.map((p, i) => [p.id, createBot(level, mulberry32(seed + i))]));
  const t: Table = { state, bots, watchers, seen: new Set(), steps: 0 };
  observe(t, state.log);
  return t;
}

function observe(t: Table, events: GameState['log']): void {
  for (const { cardId } of t.state.revealed) t.seen.add(cardId);
  for (const [id, bot] of t.bots) bot.observe(buildView(t.state, id), events);
  const seat = t.state.players[0]?.id;
  if (seat) for (const bot of t.watchers) bot.observe(buildView(t.state, seat), events);
}

/** Un paso: quien pueda jugar, juega lo que diga su bot. */
function step(t: Table): boolean {
  const actor = t.state.players.find((p) => canPlay(t.state, p.id));
  if (!actor) return false;
  const action = t.bots.get(actor.id)?.decide(buildView(t.state, actor.id));
  expect(action, `el bot de ${actor.id} no sabe qué hacer en ${t.state.phase}`).toBeTruthy();
  const result = applyAction(t.state, actor.id, action!);
  expect(result.ok, `acción rechazada: ${JSON.stringify(action)}`).toBe(true);
  if (!result.ok) return false;
  t.state = result.state;
  t.steps++;
  observe(t, result.events);
  return true;
}

/**
 * Lo que de verdad importa: todo lo que el bot recuerda tiene que ser cierto y
 * tiene que haberlo visto la mesa entera (o ser su propia mano).
 */
function checkMemory(t: Table): void {
  for (const [id, bot] of t.bots) {
    bot.memory.center.forEach((value, slot) => {
      if (value === null) return;
      const cardId = t.state.center[slot];
      expect(cardId, `${id} recuerda un hueco vacío`).not.toBeNull();
      expect(valueOf(t.state, cardId as CardId), `${id} recuerda mal el hueco ${slot}`).toBe(value);
      expect(t.seen.has(cardId as CardId), `${id} conoce una carta que nadie ha volteado`).toBe(true);
    });

    for (const [playerId, hand] of Object.entries(bot.memory.hands)) {
      hand.forEach((value, index) => {
        if (value === null) return;
        const cardId = handOf(t.state, playerId)[index];
        expect(cardId, `${id} recuerda una carta que ya no existe`).toBeDefined();
        expect(valueOf(t.state, cardId as CardId), `${id} recuerda mal la mano de ${playerId}`).toBe(value);
        expect(
          t.seen.has(cardId as CardId) || playerId === id,
          `${id} conoce una carta de ${playerId} que nadie ha volteado`,
        ).toBe(true);
      });
    }
  }
}

const SCENARIOS: { mode: GameMode; players: number }[] = [
  { mode: 'simple', players: 3 },
  { mode: 'simple', players: 6 },
  { mode: 'teams', players: 4 },
];

describe('bot: memoria honrada', () => {
  it.each(SCENARIOS)('$mode con $players jugadores: solo recuerda lo que ha visto', ({ mode, players }) => {
    for (let game = 0; game < 4; game++) {
      const state = createGame({ players: roster(players), mode, rng: mulberry32(100 + game) });
      const t = table(state, 'hard', game);
      checkMemory(t);
      while (t.state.phase !== 'finished' && t.steps < 3_000) {
        if (!step(t)) break;
        checkMemory(t);
      }
      expect(t.state.phase, 'la partida de bots no terminó').toBe('finished');
    }
  }, 60_000);

  it('el bot que entra a mitad de partida empieza sin recordar nada', () => {
    const state = createGame({ players: roster(3), mode: 'simple', rng: mulberry32(9) });
    const t = table(state, 'hard');
    for (let i = 0; i < 12; i++) step(t);

    const nuevo = createBot('hard', mulberry32(3));
    nuevo.observe(buildView(t.state, 'p1'), []);
    const known = [...nuevo.memory.center, ...(nuevo.memory.hands['p0'] ?? [])].filter((v) => v !== null);
    // Solo lo que esté boca arriba en este instante; su mano propia va aparte.
    expect(known).toHaveLength(t.state.revealed.length);
    expect(nuevo.memory.hands['p1']).toHaveLength(handOf(t.state, 'p1').length);
  });
});

describe('bot: cómo juega', () => {
  /** Deja a todos viendo el 4 del centro y el 4 de p1, y el turno en el bot (p0). */
  const learned = (): GameState => {
    let s = stateFromLayout({
      hands: [[4, 8, 9], [4, 5, 6], [2, 3, 12]],
      center: [4, 10, 11],
      current: 1,
    });
    s = must(s, 'p1', reveal(0)); // el 4 del centro, a la vista de todos
    s = must(s, 'p1', ask('p2', 'lowest')); // un 2: no casa
    s = must(s, 'p1', { type: 'CONFIRM_RETURN' });
    s = must(s, 'p2', ask('p1', 'lowest')); // el 4 de p1, a la vista de todos
    s = must(s, 'p2', ask('p2', 'highest')); // un 12: no casa
    return must(s, 'p2', { type: 'CONFIRM_RETURN' });
  };

  it('con tres cartas conocidas del mismo valor, va a por el trío', () => {
    const start = learned();
    expect(start.currentPlayerIndex).toBe(0);

    const t = table(start, 'hard');
    // El bot ha visto el 4 del centro y el de p1, y el suyo lo conoce de siempre.
    while (t.state.phase === 'awaitingReveal' && t.steps < 5) step(t);

    expect(t.state.outcome).toBe('trio');
    expect(t.state.revealed.map((r) => valueOf(t.state, r.cardId))).toEqual([4, 4, 4]);
  });

  it('sin nada conocido, voltea cartas nuevas en vez de repetir', () => {
    const state = createGame({ players: roster(3), mode: 'simple', rng: mulberry32(4) });
    const t = table(state, 'hard');
    const first = t.bots.get(t.state.players[t.state.currentPlayerIndex]!.id)!;
    const action = first.decide(buildView(t.state, t.state.players[t.state.currentPlayerIndex]!.id));
    expect(action?.type === 'REVEAL_CENTER' || action?.type === 'REVEAL_PLAYER').toBe(true);
  });

  it('cierra la jugada cuando le toca confirmar', () => {
    const s = must(must(stateFromLayout({ hands: [[3, 5, 9], [1, 4, 4], [2, 6, 8]], center: [10, 11, 12] }), 'p0', reveal(0)), 'p0', ask('p1', 'lowest'));
    const bot = createBot('normal', mulberry32(1));
    expect(bot.decide(buildView(s, 'p0'))).toEqual({ type: 'CONFIRM_RETURN' });
    expect(bot.decide(buildView(s, 'p1'))).toBeNull();
  });

  it('en el intercambio da una carta repetida, si la tiene', () => {
    const s = createGame({ players: roster(4), mode: 'teams', rng: mulberry32(5) });
    const bot = createBot('normal', mulberry32(2));
    const view = buildView(s, 'p0');
    const values = view.myHand.map((c) => c.value);
    const action = bot.decide(view);

    expect(action?.type).toBe('SWAP_CHOOSE');
    const chosen = values[(action as { handIndex: number }).handIndex] as Value;
    const repeated = values.filter((v, i) => values.indexOf(v) !== i);
    if (repeated.length > 0) expect(repeated).toContain(chosen);
    else expect(chosen).toBe(values[0]);
  });
});

describe('bot: niveles', () => {
  /** Tres niveles viendo exactamente la misma partida, para que solo cambie el olvido. */
  const remembered = (): Record<BotLevel, number> => {
    const levels: BotLevel[] = ['easy', 'normal', 'hard'];
    const watchers = levels.map((level, i) => createBot(level, mulberry32(30 + i)));
    // Con bots olvidadizos al mando la partida dura, que es lo que hace falta
    // para que se note la diferencia entre recordar y no recordar.
    const state = createGame({ players: roster(6), mode: 'simple', rng: mulberry32(21) });
    const t = table(state, 'easy', 5, watchers);
    for (let i = 0; i < 60 && t.state.phase !== 'finished'; i++) step(t);

    const count = (bot: Bot) => {
      const others = Object.entries(bot.memory.hands)
        .filter(([id]) => id !== t.state.players[0]?.id) // la mano propia no se olvida
        .flatMap(([, hand]) => hand);
      return [...bot.memory.center, ...others].filter((v) => v !== null).length;
    };
    return { easy: count(watchers[0]!), normal: count(watchers[1]!), hard: count(watchers[2]!) };
  };

  it('el difícil no olvida, el normal algo y el fácil bastante', () => {
    const { easy, normal, hard } = remembered();
    expect(hard).toBeGreaterThan(6);
    expect(normal).toBeLessThan(hard);
    expect(easy).toBeLessThan(normal);
  });
});
