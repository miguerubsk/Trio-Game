import { dealSpec, fullDeckValues, type Card, type GameMode } from './cards';
import { sortHand, teamIndexes } from './helpers';
import { shuffle, type Rng } from './rng';
import { openSwap } from './swap';
import { beginTurn } from './turn';
import type { CardId, GameEvent, GameState, Player, PlayerId } from './types';

export const DEFAULT_TARGET_TRIOS = 3;

export interface NewGameOptions {
  /**
   * En orden de asiento. En equipos, el equipo de cada asiento es
   * `asiento % nº de equipos`, así que los compañeros quedan alternados.
   */
  players: { id: PlayerId; name: string }[];
  mode: GameMode;
  /** Inyectado: en producción criptográfico, en tests sembrado. */
  rng: Rng;
  targetTrios?: number;
}

export function createGame(opts: NewGameOptions): GameState {
  const { players, mode, rng } = opts;
  const spec = dealSpec(mode, players.length);
  if (!spec) throw new Error(`Combinación no válida: ${players.length} jugadores en modo ${mode}`);
  if (new Set(players.map((p) => p.id)).size !== players.length) {
    throw new Error('Hay ids de jugador repetidos');
  }

  // Los ids se asignan después de barajar, para que no delaten el valor.
  const cards: Card[] = shuffle(fullDeckValues(), rng).map((value, id) => ({
    id,
    value,
    secondary: [],
  }));

  const teamCount = players.length / 2;
  const seated: Player[] = players.map((p, seat) => ({
    id: p.id,
    name: p.name,
    team: mode === 'teams' ? seat % teamCount : null,
  }));

  const hands: Record<PlayerId, CardId[]> = {};
  const trios: GameState['trios'] = {};
  let next = 0;
  for (const p of seated) {
    hands[p.id] = cards.slice(next, next + spec.handSize).map((c) => c.id);
    trios[p.id] = [];
    next += spec.handSize;
  }
  const center = cards.slice(next, next + spec.centerSize).map((c) => c.id);

  const state: GameState = {
    config: { mode, targetTrios: opts.targetTrios ?? DEFAULT_TARGET_TRIOS },
    cards,
    players: seated,
    hands,
    center,
    revealed: [],
    outcome: null,
    trios,
    phase: 'awaitingReveal',
    currentPlayerIndex: Math.floor(rng() * seated.length),
    swap: null,
    winner: null,
    log: [],
  };
  for (const hand of Object.values(hands)) sortHand(state, hand);

  const events: GameEvent[] = [];
  if (mode === 'teams') openSwap(state, 'start', teamIndexes(state), events);
  else beginTurn(state, events);
  state.log = events;
  return state;
}
