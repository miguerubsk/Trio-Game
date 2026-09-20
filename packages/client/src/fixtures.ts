import type { HandSlotView, PlayerView, PublicPlayerView, RoomView, Value } from '@trio/shared';

/** Vistas de mentira para los tests de interfaz. No se usa en la aplicación. */

/** Una mano a partir de sus valores: null = boca abajo para quien mira. */
export const hand = (values: (Value | null)[]): HandSlotView[] =>
  values.map((value) => (value === null ? { faceUp: false } : { faceUp: true, value }));

const players: PublicPlayerView[] = [
  { id: 'p0', name: 'Ana', team: null, hand: hand([null, null, null]), trios: [] },
  { id: 'p1', name: 'Bea', team: null, hand: hand([null, null, null]), trios: [] },
  { id: 'p2', name: 'Carlos', team: null, hand: hand([null, null, null]), trios: [] },
];

export function playerView(patch: Partial<PlayerView> = {}): PlayerView {
  return {
    me: 'p0',
    mode: 'simple',
    targetTrios: 3,
    phase: 'awaitingReveal',
    outcome: null,
    currentPlayerId: 'p0',
    players,
    center: [{ state: 'down' }, { state: 'down' }, { state: 'empty' }],
    revealed: [],
    myHand: [
      { value: 2, faceUp: false },
      { value: 5, faceUp: false },
      { value: 9, faceUp: false },
    ],
    swap: null,
    winner: null,
    legal: { reveal: { centerSlots: [0, 1], targets: ['p0', 'p1', 'p2'] }, confirm: false, swap: null },
    log: [],
    ...patch,
  };
}

export function roomView(patch: Partial<RoomView> = {}): RoomView {
  return {
    code: 'ABCD',
    me: 'p0',
    hostId: 'p0',
    status: 'playing',
    config: { mode: 'simple', idleSeconds: 90, botLevel: 'normal', botTakeoverSeconds: 60 },
    members: players.map((p) => ({
      id: p.id,
      name: p.name,
      connected: true,
      bot: false,
      playedByBot: false,
      gone: false,
      team: null,
    })),
    startBlocker: null,
    autoActionAt: null,
    ...patch,
  };
}

const teamPlayers: PublicPlayerView[] = [
  { id: 'p0', name: 'Ana', team: 0, hand: hand([null, null, null]), trios: [] },
  { id: 'p1', name: 'Bea', team: 1, hand: hand([null, null, null]), trios: [] },
  { id: 'p2', name: 'Carlos', team: 0, hand: hand([null, null, null]), trios: [] },
  { id: 'p3', name: 'Dani', team: 1, hand: hand([null, null, null]), trios: [] },
];

/** Cuatro jugadores por parejas: Ana y Carlos contra Bea y Dani. Sin centro. */
export function teamsView(patch: Partial<PlayerView> = {}): PlayerView {
  return playerView({
    mode: 'teams',
    players: teamPlayers,
    center: [],
    legal: { reveal: { centerSlots: [], targets: ['p0', 'p1', 'p2', 'p3'] }, confirm: false, swap: null },
    ...patch,
  });
}

/** La sala equivalente, ya en modo por equipos. */
export function teamsRoom(patch: Partial<RoomView> = {}): RoomView {
  return roomView({
    config: { mode: 'teams', idleSeconds: 90, botLevel: 'normal', botTakeoverSeconds: 60 },
    members: teamPlayers.map((p) => ({
      id: p.id,
      name: p.name,
      connected: true,
      bot: false,
      playedByBot: false,
      gone: false,
      team: p.team,
    })),
    ...patch,
  });
}
