import type {
  ClosedReason,
  ErrorCode,
  GameMode,
  LogEntry,
  PlayerId,
  PlayerView,
  RevealFrom,
  RoomErrorCode,
  StartBlocker,
  Winner,
} from '@trio/shared';

/** Nombres por id, para no repetir la búsqueda en cada línea. */
export type Names = Record<PlayerId, string>;

export const nameOf = (names: Names, id: PlayerId): string => names[id] ?? 'alguien';

/** Un texto por cada código de error: el tipo obliga a no dejarse ninguno. */
const ERRORS: Record<RoomErrorCode | ErrorCode, string> = {
  BAD_REQUEST: 'No se ha podido enviar la jugada.',
  SERVER_FULL: 'El servidor no admite más salas ahora mismo.',
  ROOM_NOT_FOUND: 'No existe ninguna sala con ese código.',
  ROOM_FULL: 'La sala ya está completa.',
  GAME_IN_PROGRESS: 'La partida ya ha empezado.',
  INVALID_NAME: 'Escribe un nombre de 1 a 20 caracteres.',
  NAME_TAKEN: 'Ya hay alguien con ese nombre en la sala.',
  INVALID_TOKEN: 'Esa partida ya no te reconoce.',
  NOT_IN_ROOM: 'Ya no estás en la sala.',
  NOT_HOST: 'Solo el anfitrión puede hacer eso.',
  INVALID_CONFIG: 'Esa configuración no vale.',
  INVALID_TEAM: 'Ese equipo no existe.',
  TEAM_FULL: 'Ese equipo ya tiene dos jugadores.',
  INVALID_MEMBER: 'Ese jugador ya no está en la sala.',
  CANNOT_START: 'Todavía no se puede empezar.',
  NOT_PLAYING: 'No hay ninguna partida en marcha.',
  GAME_OVER: 'La partida ya ha terminado.',
  UNKNOWN_PLAYER: 'No estás en esta partida.',
  UNKNOWN_ACTION: 'Esa acción no existe.',
  WRONG_PHASE: 'Ahora mismo no toca eso.',
  NOT_YOUR_TURN: 'No es tu turno.',
  INVALID_SLOT: 'Ese hueco no existe.',
  SLOT_EMPTY: 'En ese hueco ya no hay carta.',
  ALREADY_REVEALED: 'Esa carta ya está boca arriba.',
  INVALID_TARGET: 'Ese jugador no está en la partida.',
  INVALID_END: 'Pide la más baja o la más alta.',
  NO_HIDDEN_CARDS: 'A ese jugador no le quedan cartas boca abajo.',
  NOT_IN_SWAP: 'Ahora no te toca intercambiar.',
  ALREADY_RESPONDED: 'Ya has respondido al intercambio.',
  INVALID_INDEX: 'Esa carta no existe.',
};

export const errorText = (code: RoomErrorCode | ErrorCode): string =>
  ERRORS[code] ?? 'Algo ha ido mal.';

/** Por qué te has quedado fuera de la sala; null si te has ido tú. */
export function closedText(reason: ClosedReason): string | null {
  if (reason === 'kicked') return 'El anfitrión te ha sacado de la sala.';
  if (reason === 'expired') return 'La sala se ha cerrado por inactividad.';
  return null;
}

export function blockerText(blocker: StartBlocker, mode: GameMode): string {
  if (blocker === 'TEAMS_UNBALANCED') return 'Cada equipo necesita exactamente dos jugadores.';
  return mode === 'teams'
    ? 'En modo por equipos hacen falta 4 o 6 jugadores.'
    : 'Hacen falta entre 3 y 6 jugadores.';
}

export function winnerText(winner: Winner, names: Names): string {
  const who =
    winner.playerIds.length > 1
      ? `el equipo de ${winner.playerIds.map((id) => nameOf(names, id)).join(' y ')}`
      : nameOf(names, winner.playerIds[0] ?? '');
  return winner.reason === 'sevens'
    ? `¡Gana ${who} con el trío de sietes!`
    : `¡Gana ${who}!`;
}

/** De dónde salió una carta volteada, tal como se cuenta en el registro. */
function sourceText(from: RevealFrom, names: Names, actor: PlayerId): string {
  if (from.kind === 'center') return `el hueco ${from.slot + 1}`;
  if (from.playerId === actor) return 'una carta suya';
  return `una carta de ${nameOf(names, from.playerId)}`;
}

/**
 * Una línea del registro, o null si no merece la pena contarla. Ojo: una
 * revelación solo trae valor mientras la carta sigue boca arriba.
 */
export function logText(entry: LogEntry, names: Names): string | null {
  switch (entry.type) {
    case 'turn':
      return `Turno de ${nameOf(names, entry.playerId)}.`;
    case 'skip':
      return `${nameOf(names, entry.playerId)} ya no está: se salta su turno.`;
    case 'reveal': {
      const what = sourceText(entry.from, names, entry.by);
      const who = nameOf(names, entry.by);
      return 'value' in entry ? `${who} voltea ${what}: ${entry.value}.` : `${who} volteó ${what}.`;
    }
    case 'mismatch':
      return 'No coinciden.';
    case 'trio':
      return `¡${nameOf(names, entry.by)} forma un trío de ${entry.value}!`;
    case 'return':
      return 'Las cartas vuelven a su sitio.';
    case 'collect':
      return null; // ya lo cuenta el trío
    case 'swapRequested':
      return entry.reason === 'start'
        ? 'Antes de empezar, cada pareja puede intercambiar una carta.'
        : 'Los demás equipos pueden intercambiar una carta.';
    case 'swapResolved':
      return `El equipo ${entry.team + 1} ${entry.swapped ? 'intercambia una carta' : 'no intercambia'}.`;
    case 'gameOver':
      return winnerText(entry.winner, names);
  }
}

export interface Status {
  main: string;
  hint?: string;
}

/** Lo que pone la barra de estado: qué pasa y qué se espera de ti. */
export function statusText(view: PlayerView, names: Names): Status {
  const current = nameOf(names, view.currentPlayerId);
  const mine = view.currentPlayerId === view.me;

  if (view.phase === 'finished') {
    return { main: view.winner ? winnerText(view.winner, names) : 'Partida terminada.' };
  }
  if (view.phase === 'teamSwap') {
    // El panel del intercambio explica qué hacer: aquí solo lo imprescindible.
    return { main: 'Intercambio entre compañeros.' };
  }
  if (view.phase === 'awaitingReturn') {
    const value = view.revealed[0]?.value;
    const main = view.outcome === 'trio' ? `¡Trío de ${value}!` : 'No coinciden.';
    return {
      main,
      hint: mine
        ? 'Que todos se fijen bien. Pulsa «continuar» cuando quieras.'
        : `Memoriza: ${current} decide cuándo continuar.`,
    };
  }
  // A mitad de turno: lo que llevas volteado, que ya casa, y lo que falta.
  const value = view.revealed[0]?.value;
  if (value !== undefined && view.revealed.length === 2) {
    return mine
      ? { main: '¡Te falta uno!', hint: `Encuentra el tercer ${value} y es tuyo.` }
      : { main: `Turno de ${current}`, hint: `Lleva dos ${value}: le falta uno.` };
  }
  if (mine && value !== undefined) return { main: 'Te toca', hint: `Busca otro ${value}.` };
  return {
    main: mine ? 'Te toca' : `Turno de ${current}`,
    hint: mine ? 'Voltea una carta del centro o pide la más baja o la más alta de alguien.' : undefined,
  };
}

/** Cuenta atrás de la salvaguarda del servidor, solo cuando ya está cerca. */
export function autoActionText(autoActionAt: number | null, now: number): string | null {
  if (autoActionAt === null) return null;
  const seconds = Math.ceil((autoActionAt - now) / 1000);
  if (seconds > 30 || seconds < 0) return null;
  return `El servidor continuará solo en ${seconds} s`;
}
