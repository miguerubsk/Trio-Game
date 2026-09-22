import type { Value } from './cards';
import type { CardId, End, GameState, Player, PlayerId } from './types';

/** El estado es JSON puro, así que este clon es seguro y barato (36 cartas). */
export const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export function valueOf(s: GameState, id: CardId): Value {
  const card = s.cards[id];
  if (!card) throw new Error(`Carta desconocida: ${id}`);
  return card.value;
}

export function handOf(s: GameState, playerId: PlayerId): CardId[] {
  const hand = s.hands[playerId];
  if (!hand) throw new Error(`Jugador desconocido: ${playerId}`);
  return hand;
}

export function triosOf(s: GameState, playerId: PlayerId): Value[] {
  const trios = s.trios[playerId];
  if (!trios) throw new Error(`Jugador desconocido: ${playerId}`);
  return trios;
}

export function playerById(s: GameState, playerId: PlayerId): Player {
  const player = s.players.find((p) => p.id === playerId);
  if (!player) throw new Error(`Jugador desconocido: ${playerId}`);
  return player;
}

export function currentPlayer(s: GameState): Player {
  const player = s.players[s.currentPlayerIndex];
  if (!player) throw new Error(`Turno fuera de rango: ${s.currentPlayerIndex}`);
  return player;
}

export function isRevealed(s: GameState, id: CardId): boolean {
  return s.revealed.some((r) => r.cardId === id);
}

/**
 * Índice (en la mano ordenada) de la carta oculta más baja o más alta, o -1 si
 * no queda ninguna. Las reveladas siguen en la fila pero ya no cuentan: por eso
 * pedir dos veces «la más baja» devuelve la siguiente.
 */
export function hiddenIndex(s: GameState, playerId: PlayerId, end: End): number {
  const hand = handOf(s, playerId);
  if (end === 'lowest') {
    for (let i = 0; i < hand.length; i++) if (!isRevealed(s, hand[i] as CardId)) return i;
  } else {
    for (let i = hand.length - 1; i >= 0; i--) if (!isRevealed(s, hand[i] as CardId)) return i;
  }
  return -1;
}

/** Orden ascendente por valor; el id desempata para que sea determinista. */
export function sortHand(s: GameState, hand: CardId[]): void {
  hand.sort((a, b) => valueOf(s, a) - valueOf(s, b) || a - b);
}

export function teamMembers(s: GameState, team: number): PlayerId[] {
  return s.players.filter((p) => p.team === team).map((p) => p.id);
}

export function teamIndexes(s: GameState): number[] {
  const teams = new Set<number>();
  for (const p of s.players) if (p.team !== null) teams.add(p.team);
  return [...teams].sort((a, b) => a - b);
}

/** Tríos que cuentan para la victoria: los propios, o los de toda la pareja. */
export function trioValuesOfSide(s: GameState, playerId: PlayerId): Value[] {
  const player = playerById(s, playerId);
  if (!s.config.teams || player.team === null) return [...triosOf(s, playerId)];
  return teamMembers(s, player.team).flatMap((id) => triosOf(s, id));
}

export const triosOfSide = (s: GameState, playerId: PlayerId): number => trioValuesOfSide(s, playerId).length;
