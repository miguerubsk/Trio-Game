import { handOf, sortHand, teamMembers } from './helpers';
import { beginTurn } from './turn';
import type { ErrorCode, GameEvent, GameState, PlayerId, SwapResponse, SwapTeam } from './types';

/**
 * Abre una ronda de intercambios para los equipos indicados. Cada pareja
 * intercambia una carta solo si sus dos miembros eligen una; si cualquiera
 * pasa, no hay intercambio.
 */
export function openSwap(
  s: GameState,
  reason: 'start' | 'trio',
  teams: number[],
  events: GameEvent[],
): void {
  s.phase = 'teamSwap';
  s.swap = {
    reason,
    teams: teams.map((team) => ({
      team,
      done: false,
      responses: Object.fromEntries(teamMembers(s, team).map((id) => [id, null])),
    })),
  };
  events.push({ type: 'swapRequested', reason, teams });

  // Una pareja con algún miembro sin cartas no puede intercambiar: se resuelve sola.
  for (const entry of s.swap.teams) {
    if (Object.keys(entry.responses).some((id) => handOf(s, id).length === 0)) {
      resolveTeam(s, entry, events);
    }
  }
  closeIfDone(s, events);
}

export function respondSwap(
  s: GameState,
  actor: PlayerId,
  response: SwapResponse,
  events: GameEvent[],
): ErrorCode | null {
  if (s.phase !== 'teamSwap' || !s.swap) return 'WRONG_PHASE';
  const entry = s.swap.teams.find((t) => !t.done && Object.hasOwn(t.responses, actor));
  if (!entry) return 'NOT_IN_SWAP';
  if (entry.responses[actor] !== null) return 'ALREADY_RESPONDED';
  if (response !== 'pass') {
    const size = handOf(s, actor).length;
    if (!Number.isInteger(response) || response < 0 || response >= size) return 'INVALID_INDEX';
  }

  entry.responses[actor] = response;
  if (Object.values(entry.responses).every((r) => r !== null)) resolveTeam(s, entry, events);
  closeIfDone(s, events);
  return null;
}

function resolveTeam(s: GameState, entry: SwapTeam, events: GameEvent[]): void {
  const ids = Object.keys(entry.responses);
  let swapped = false;

  if (ids.length === 2) {
    const [idA, idB] = ids as [PlayerId, PlayerId];
    const ra = entry.responses[idA];
    const rb = entry.responses[idB];
    if (typeof ra === 'number' && typeof rb === 'number') {
      const handA = handOf(s, idA);
      const handB = handOf(s, idB);
      const [cardA] = handA.splice(ra, 1);
      const [cardB] = handB.splice(rb, 1);
      if (cardA !== undefined && cardB !== undefined) {
        handA.push(cardB);
        handB.push(cardA);
        sortHand(s, handA);
        sortHand(s, handB);
        swapped = true;
      }
    }
  }

  entry.done = true;
  events.push({ type: 'swapResolved', team: entry.team, swapped });
}

function closeIfDone(s: GameState, events: GameEvent[]): void {
  if (s.swap && s.swap.teams.every((t) => t.done)) {
    s.swap = null;
    beginTurn(s, events);
  }
}
