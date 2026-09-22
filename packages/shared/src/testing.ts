import { CONNECTIONS, TRIOS_TO_WIN, type Card, type GameMode, type Value } from './cards';
import { applyAction } from './engine';
import { handOf, sortHand, valueOf } from './helpers';
import type { Action, CardId, GameState, Player, PlayerId } from './types';

export interface Layout {
  mode?: GameMode;
  /** Variante por equipos: los equipos se asignan alternando asientos. */
  teams?: boolean;
  /** Valores de la mano de cada jugador, por asiento. Los ids son p0, p1… */
  hands: Value[][];
  center?: Value[];
  current?: number;
  targetTrios?: number;
}

/** Monta un estado a medida, listo para revelar y sin repartir. Solo para tests. */
export function stateFromLayout(layout: Layout): GameState {
  const mode = layout.mode ?? 'simple';
  const teams = layout.teams ?? false;
  const cards: Card[] = [];
  const add = (value: Value): CardId => {
    const id = cards.length;
    cards.push({ id, value, secondary: CONNECTIONS[value] });
    return id;
  };

  const teamCount = layout.hands.length / 2;
  const players: Player[] = layout.hands.map((_, seat) => ({
    id: `p${seat}`,
    name: `Jugador ${seat}`,
    team: teams ? seat % teamCount : null,
  }));

  const hands: GameState['hands'] = {};
  const trios: GameState['trios'] = {};
  layout.hands.forEach((values, seat) => {
    hands[`p${seat}`] = values.map(add);
    trios[`p${seat}`] = [];
  });
  const center = (layout.center ?? []).map(add);

  const state: GameState = {
    config: { mode, teams, targetTrios: layout.targetTrios ?? TRIOS_TO_WIN[mode] },
    cards,
    players,
    hands,
    center,
    revealed: [],
    outcome: null,
    trios,
    phase: 'awaitingReveal',
    currentPlayerIndex: layout.current ?? 0,
    swap: null,
    winner: null,
    log: [],
  };
  for (const hand of Object.values(hands)) sortHand(state, hand);
  return state;
}

/** Aplica una acción que debe ser legal; si no lo es, el test falla con el motivo. */
export function must(state: GameState, actor: PlayerId, action: Action): GameState {
  const result = applyAction(state, actor, action);
  if (!result.ok) throw new Error(`Acción rechazada (${result.error}): ${JSON.stringify(action)}`);
  return result.state;
}

/** Valores de la mano de un jugador, en orden. */
export function handValues(state: GameState, playerId: PlayerId): Value[] {
  return handOf(state, playerId).map((id) => valueOf(state, id));
}

export const reveal = (slot: number) => ({ type: 'REVEAL_CENTER', slot }) as const;
export const ask = (targetId: PlayerId, end: 'lowest' | 'highest') =>
  ({ type: 'REVEAL_PLAYER', targetId, end }) as const;
export const CONFIRM = { type: 'CONFIRM_RETURN' } as const;
export const choose = (handIndex: number) => ({ type: 'SWAP_CHOOSE', handIndex }) as const;
export const PASS = { type: 'SWAP_PASS' } as const;
