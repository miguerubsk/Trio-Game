import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  IDLE_SECONDS,
  legalActions,
  mulberry32,
  ROOM_CODE_ALPHABET,
  type Action,
  type GameEvent,
  type GameState,
  type PlayerId,
} from '@trio/shared';
import { Room, RoomRegistry, type Member, type RoomListener } from './rooms';

interface Harness {
  registry: RoomRegistry;
  changes: (GameEvent[] | null)[];
  removed: { id: PlayerId; reason: string }[];
}

function harness(ttlMs = 60_000): Harness {
  const changes: Harness['changes'] = [];
  const removed: Harness['removed'] = [];
  const listener: RoomListener = {
    changed: (_room, events) => changes.push(events),
    removed: (_room, member, reason) => removed.push({ id: member.id, reason }),
  };
  return { registry: new RoomRegistry({ listener, rng: mulberry32(11), ttlMs }), changes, removed };
}

const NAMES = ['Ana', 'Bea', 'Carlos', 'Dani', 'Eva', 'Fran', 'Gus'];

/** Sala con `n` jugadores; el primero es el anfitrión. */
function lobby(n: number, h = harness()): { room: Room; members: Member[]; h: Harness } {
  const created = h.registry.create(NAMES[0] as string);
  if (typeof created === 'string') throw new Error(created);
  const members = [created.host];
  for (let i = 1; i < n; i++) {
    const m = created.room.join(NAMES[i] as string);
    if (typeof m === 'string') throw new Error(m);
    members.push(m);
  }
  for (const m of members) created.room.connect(m.id);
  return { room: created.room, members, h };
}

function started(n: number, mode: 'simple' | 'teams' = 'simple') {
  const setup = lobby(n);
  expect(setup.room.configure(setup.members[0]!.id, { mode })).toBeNull();
  expect(setup.room.start(setup.members[0]!.id)).toBeNull();
  return setup;
}

/** De sobra para cualquier pausa de bot, que la más larga es la de «continuar». */
const BOT_TIME = 6_000;

const game = (room: Room): GameState => {
  if (!room.game) throw new Error('No hay partida');
  return room.game;
};
const current = (room: Room): PlayerId => game(room).players[game(room).currentPlayerIndex]!.id;

/** El jugador activo voltea cartas legales hasta que la jugada se cierra. */
function playUntilSettled(room: Room): void {
  while (game(room).phase === 'awaitingReveal') {
    const actor = current(room);
    const legal = legalActions(game(room), actor).reveal;
    if (!legal) throw new Error('sin revelaciones legales');
    const action: Action =
      legal.centerSlots.length > 0
        ? { type: 'REVEAL_CENTER', slot: legal.centerSlots[0]! }
        : { type: 'REVEAL_PLAYER', targetId: legal.targets[0]!, end: 'lowest' };
    expect(room.act(actor, action)).toBeNull();
  }
}

/** Todos los intercambios pendientes se pasan. */
function passSwaps(room: Room): void {
  for (const p of game(room).players) {
    if (legalActions(game(room), p.id).swap) expect(room.act(p.id, { type: 'SWAP_PASS' })).toBeNull();
  }
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('sala', () => {
  it('se crea con un código de cuatro letras sin ambigüedades y el creador de anfitrión', () => {
    const { room, members } = lobby(1);
    expect(room.code).toMatch(new RegExp(`^[${ROOM_CODE_ALPHABET}]{4}$`));
    expect(room.code).not.toMatch(/[OI01]/);
    expect(room.hostId).toBe(members[0]!.id);
    expect(room.status).toBe('lobby');
  });

  it('caben seis jugadores; el séptimo no', () => {
    const { room } = lobby(6);
    expect(room.join('Gus')).toBe('ROOM_FULL');
  });

  it('no admite dos nombres iguales, sin distinguir mayúsculas', () => {
    const { room } = lobby(2);
    expect(room.join('ANA')).toBe('NAME_TAKEN');
  });

  it('cada jugador tiene un id público y un token secreto distintos', () => {
    const { members } = lobby(3);
    const ids = new Set(members.map((m) => m.id));
    const tokens = new Set(members.map((m) => m.token));
    expect(ids.size).toBe(3);
    expect(tokens.size).toBe(3);
    for (const m of members) expect(m.token).not.toBe(m.id);
  });

  it('la vista de la sala no lleva ningún token', () => {
    const { room, members } = lobby(3);
    const json = JSON.stringify(room.viewFor(members[1]!.id));
    for (const m of members) expect(json).not.toContain(m.token);
  });

  it('solo el anfitrión configura, y solo con valores válidos', () => {
    const { room, members } = lobby(3);
    const [host, guest] = members as [Member, Member];
    expect(room.configure(guest.id, { mode: 'teams' })).toBe('NOT_HOST');
    expect(room.configure(host.id, { mode: 'picante' })).toBe('INVALID_CONFIG');
    expect(room.configure(host.id, { idleSeconds: IDLE_SECONDS.min - 1 })).toBe('INVALID_CONFIG');
    expect(room.configure(host.id, { idleSeconds: 45.5 })).toBe('INVALID_CONFIG');
    expect(room.configure(host.id, { mode: 'teams', idleSeconds: 120 })).toBeNull();
    expect(room.config).toMatchObject({ mode: 'teams', idleSeconds: 120 });
  });

  it('dice por qué no se puede empezar', () => {
    const { room, members } = lobby(2);
    expect(room.startBlocker()).toBe('PLAYER_COUNT');
    expect(room.start(members[0]!.id)).toBe('CANNOT_START');

    room.join('Carlos');
    expect(room.startBlocker()).toBeNull();
    room.configure(members[0]!.id, { mode: 'teams' });
    expect(room.startBlocker()).toBe('PLAYER_COUNT');
  });

  it('solo el anfitrión empieza la partida', () => {
    const { room, members } = lobby(3);
    expect(room.start(members[1]!.id)).toBe('NOT_HOST');
    expect(room.start(members[0]!.id)).toBeNull();
    expect(room.status).toBe('playing');
    expect(room.start(members[0]!.id)).toBe('GAME_IN_PROGRESS');
  });

  it('con la partida empezada no entra nadie nuevo, pero se vuelve con el token', () => {
    const { room, members } = started(3);
    expect(room.join('Dani')).toBe('GAME_IN_PROGRESS');
    expect(room.memberByToken(members[1]!.token)).toBe(members[1]);
    expect(room.memberByToken('token-inventado')).toBeUndefined();
    expect(room.memberByToken('')).toBeUndefined();
  });

  it('si el anfitrión se desconecta, pasa a otro jugador conectado', () => {
    const { room, members } = lobby(3);
    const [host, second, third] = members as [Member, Member, Member];
    room.disconnect(second.id);
    room.disconnect(host.id);
    expect(room.hostId).toBe(third.id);
    expect(room.viewFor(host.id).members.find((m) => m.id === host.id)?.connected).toBe(false);
  });

  it('un anfitrión desconectado sin nadie más conectado sigue siéndolo', () => {
    const { room, members } = lobby(2);
    room.disconnect(members[1]!.id);
    room.disconnect(members[0]!.id);
    expect(room.hostId).toBe(members[0]!.id);
  });
});

describe('equipos en la sala', () => {
  it('respeta las parejas elegidas y las sienta alternadas', () => {
    const { room, members } = lobby(4);
    const [ana, bea, carlos, dani] = members as [Member, Member, Member, Member];
    room.configure(ana.id, { mode: 'teams' });
    expect(room.chooseTeam(ana.id, 1)).toBeNull();
    expect(room.chooseTeam(carlos.id, 1)).toBeNull();
    expect(room.start(ana.id)).toBeNull();

    const players = game(room).players;
    const teamOf = (id: PlayerId) => players.find((p) => p.id === id)?.team;
    expect(teamOf(ana.id)).toBe(teamOf(carlos.id));
    expect(teamOf(bea.id)).toBe(teamOf(dani.id));
    expect(teamOf(ana.id)).not.toBe(teamOf(bea.id));
    // Alternados: nunca dos compañeros en asientos contiguos.
    players.forEach((p, i) => expect(players[(i + 1) % players.length]?.team).not.toBe(p.team));
    // La sala refleja el equipo con el que se juega.
    for (const m of members) expect(m.team).toBe(teamOf(m.id));
  });

  it('un equipo no admite a un tercero ni números fuera de rango', () => {
    const { room, members } = lobby(4);
    room.configure(members[0]!.id, { mode: 'teams' });
    expect(room.chooseTeam(members[0]!.id, 0)).toBeNull();
    expect(room.chooseTeam(members[1]!.id, 0)).toBeNull();
    expect(room.chooseTeam(members[2]!.id, 0)).toBe('TEAM_FULL');
    expect(room.chooseTeam(members[2]!.id, 3)).toBe('INVALID_TEAM');
    expect(room.chooseTeam(members[2]!.id, -1)).toBe('INVALID_TEAM');
    expect(room.chooseTeam(members[2]!.id, '1')).toBe('INVALID_TEAM');
    expect(room.chooseTeam(members[0]!.id, null)).toBeNull();
    expect(room.chooseTeam(members[2]!.id, 0)).toBeNull();
  });

  it('un tercer equipo con cuatro jugadores impide empezar', () => {
    const { room, members } = lobby(4);
    room.configure(members[0]!.id, { mode: 'teams' });
    room.chooseTeam(members[3]!.id, 2);
    expect(room.startBlocker()).toBe('TEAMS_UNBALANCED');
  });
});

describe('partida', () => {
  it('empieza avisando con los eventos iniciales del motor', () => {
    const { room, h } = started(3);
    const last = h.changes.at(-1);
    expect(last?.some((e) => e.type === 'turn' && e.playerId === current(room))).toBe(true);
  });

  it('los errores del motor llegan tal cual', () => {
    const { room, members } = started(3);
    const notMe = members.find((m) => m.id !== current(room))!;
    expect(room.act(notMe.id, { type: 'REVEAL_CENTER', slot: 0 })).toBe('NOT_YOUR_TURN');
    expect(room.act(current(room), { type: 'HACK' } as unknown as Action)).toBe('UNKNOWN_ACTION');
  });

  it('cada jugador recibe su propia vista, y solo si está en la partida', () => {
    const { room, members } = started(3);
    const update = room.gameUpdate(members[1]!.id, []);
    expect(update?.view.me).toBe(members[1]!.id);
    expect(room.gameUpdate('intruso', [])).toBeNull();
  });

  it('volver a la sala deja la partida y quita a los que se fueron', () => {
    const { room, members } = started(4);
    expect(room.kick(members[0]!.id, members[3]!.id)).toBeNull();
    expect(room.reset(members[1]!.id)).toBe('NOT_HOST');
    expect(room.reset(members[0]!.id)).toBeNull();
    expect(room.status).toBe('lobby');
    expect(room.game).toBeNull();
    expect(room.members.map((m) => m.id)).toEqual(members.slice(0, 3).map((m) => m.id));
    expect(room.reset(members[0]!.id)).toBe('NOT_PLAYING');
  });
});

describe('salvaguarda de inactividad', () => {
  it('una jugada sin confirmar se confirma sola al cumplirse el plazo, no antes', () => {
    const { room } = started(3);
    const active = current(room);
    playUntilSettled(room);
    expect(game(room).phase).toBe('awaitingReturn');
    expect(room.autoActionAt).toBe(Date.now() + IDLE_SECONDS.default * 1000);
    expect(room.viewFor(active).autoActionAt).toBe(room.autoActionAt);

    vi.advanceTimersByTime(IDLE_SECONDS.default * 1000 - 1);
    expect(game(room).phase).toBe('awaitingReturn');

    vi.advanceTimersByTime(1);
    expect(game(room).phase).not.toBe('awaitingReturn');
    expect(current(room)).not.toBe(active);
    expect(room.autoActionAt).toBeNull();
  });

  it('confirmar a tiempo cancela la cuenta atrás', () => {
    const { room } = started(3);
    playUntilSettled(room);
    expect(game(room).phase).toBe('awaitingReturn');
    expect(room.act(current(room), { type: 'CONFIRM_RETURN' })).toBeNull();
    const after = current(room);
    expect(room.autoActionAt).toBeNull();

    vi.advanceTimersByTime(IDLE_SECONDS.default * 1000 * 3);
    expect(game(room).phase).toBe('awaitingReveal');
    expect(current(room)).toBe(after);
  });

  it('nunca salta un turno por sí sola', () => {
    const { room } = started(3);
    const active = current(room);
    expect(room.autoActionAt).toBeNull();
    vi.advanceTimersByTime(60 * 60 * 1000);
    expect(current(room)).toBe(active);
    expect(game(room).phase).toBe('awaitingReveal');
  });

  it('un intercambio sin responder se pasa solo, y las respuestas parciales no reinician la cuenta', () => {
    const { room } = started(4, 'teams');
    expect(game(room).phase).toBe('teamSwap');
    const deadline = room.autoActionAt;

    vi.advanceTimersByTime(30_000);
    const first = game(room).players[0]!.id;
    expect(room.act(first, { type: 'SWAP_CHOOSE', handIndex: 0 })).toBeNull();
    expect(room.autoActionAt).toBe(deadline);

    vi.advanceTimersByTime(IDLE_SECONDS.default * 1000 - 30_000);
    expect(game(room).phase).toBe('awaitingReveal');
    expect(game(room).log.filter((e) => e.type === 'swapResolved')).toEqual([
      { type: 'swapResolved', team: 0, swapped: false },
      { type: 'swapResolved', team: 1, swapped: false },
    ]);
  });

  it('usa el plazo configurado en la sala', () => {
    const { room, members } = lobby(4);
    room.configure(members[0]!.id, { mode: 'teams', idleSeconds: 30 });
    room.start(members[0]!.id);
    vi.advanceTimersByTime(30_000);
    expect(game(room).phase).toBe('awaitingReveal');
  });
});

describe('expulsar y marcharse', () => {
  it('en la sala, el expulsado sale de la lista y recibe el aviso', () => {
    const { room, members, h } = lobby(3);
    expect(room.kick(members[1]!.id, members[2]!.id)).toBe('NOT_HOST');
    expect(room.kick(members[0]!.id, members[0]!.id)).toBe('INVALID_MEMBER');
    expect(room.kick(members[0]!.id, 'nadie')).toBe('INVALID_MEMBER');
    expect(room.kick(members[0]!.id, members[2]!.id)).toBeNull();
    expect(room.members).toHaveLength(2);
    expect(h.removed).toEqual([{ id: members[2]!.id, reason: 'kicked' }]);
  });

  it('a mitad de partida su mano sigue en la mesa y la juega un bot', () => {
    const { room, members } = started(4);
    const victim = members.find((m) => m.id !== current(room) && m.id !== room.hostId)!;
    const handBefore = game(room).hands[victim.id];
    expect(room.kick(room.hostId, victim.id)).toBeNull();
    expect(game(room).hands[victim.id]).toEqual(handBefore);
    expect(room.viewFor(room.hostId).members.find((m) => m.id === victim.id)).toMatchObject({
      gone: true,
      playedByBot: true,
    });

    // Le llega el turno y lo juega su bot, sin que nadie tenga que hacer nada.
    for (let turn = 0; turn < 8 && current(room) !== victim.id; turn++) {
      playUntilSettled(room);
      if (game(room).phase === 'awaitingReturn') room.act(current(room), { type: 'CONFIRM_RETURN' });
    }
    expect(current(room)).toBe(victim.id);
    vi.advanceTimersByTime(BOT_TIME);
    expect(game(room).revealed.length + game(room).log.filter((e) => e.type === 'reveal').length).toBeGreaterThan(0);
    expect(game(room).log.some((e) => e.type === 'skip')).toBe(false);
  });

  it('sin relevo automático, al expulsado se le salta el turno como antes', () => {
    const { room, members } = lobby(3);
    room.configure(members[0]!.id, { botTakeoverSeconds: 0 });
    room.start(members[0]!.id);
    const victim = current(room);
    const host = room.hostId === victim ? room.members.find((m) => m.id !== victim)!.id : room.hostId;
    if (room.hostId === victim) room.disconnect(victim);

    expect(room.kick(host, victim)).toBeNull();
    expect(current(room)).not.toBe(victim);
    expect(game(room).log.some((e) => e.type === 'skip' && e.playerId === victim)).toBe(true);
  });

  it('marcharse a mitad de jugada deja la jugada en manos del bot', () => {
    const { room } = started(3);
    const quitter = current(room);
    const legal = legalActions(game(room), quitter).reveal!;
    room.act(quitter, { type: 'REVEAL_PLAYER', targetId: legal.targets[0]!, end: 'lowest' });
    expect(game(room).revealed).toHaveLength(1);

    expect(room.leave(quitter)).toBeNull();
    expect(game(room).revealed).toHaveLength(1); // la jugada sigue donde estaba
    vi.advanceTimersByTime(BOT_TIME * 4);
    expect(current(room)).not.toBe(quitter);
  });

  it('el bot del expulsado responde a los intercambios en equipos', () => {
    const { room } = started(4, 'teams');
    const host = room.hostId;
    const victim = game(room).players.slice(0, 2).find((p) => p.id !== host)!.id;
    expect(room.kick(host, victim)).toBeNull();

    vi.advanceTimersByTime(BOT_TIME);
    passSwaps(room);
    expect(game(room).phase).toBe('awaitingReveal');
    expect(game(room).log.filter((e) => e.type === 'swapResolved')).toHaveLength(2);
  });

  it('quien se fue no puede volver con su token ni actuar', () => {
    const { room, members } = started(3);
    const victim = members[1]!;
    room.kick(members[0]!.id, victim.id);
    expect(room.memberByToken(victim.token)).toBeUndefined();
    expect(room.act(victim.id, { type: 'CONFIRM_RETURN' })).toBe('NOT_IN_ROOM');
    expect(room.leave(victim.id)).toBe('NOT_IN_ROOM');
  });

  it('si se va el anfitrión, la sala pasa a otro aunque esté desconectado', () => {
    const { room, members } = lobby(3);
    room.disconnect(members[1]!.id);
    room.disconnect(members[2]!.id);
    expect(room.leave(members[0]!.id)).toBeNull();
    expect(room.hostId).toBe(members[1]!.id);
  });
});

describe('barrido de salas', () => {
  it('borra las salas sin actividad reciente y avisa a quien siga conectado', () => {
    const h = harness(1_000);
    const { room, members } = lobby(3, h);
    vi.advanceTimersByTime(1_001);
    expect(h.registry.sweep()).toBe(1);
    expect(h.registry.get(room.code)).toBeUndefined();
    expect(h.removed.map((r) => r.reason)).toEqual(['expired', 'expired', 'expired']);
    expect(h.removed.map((r) => r.id)).toEqual(members.map((m) => m.id));
  });

  it('respeta las salas con actividad', () => {
    const h = harness(1_000);
    const { room, members } = lobby(3, h);
    vi.advanceTimersByTime(900);
    room.configure(members[0]!.id, { idleSeconds: 60 });
    vi.advanceTimersByTime(900);
    expect(h.registry.sweep()).toBe(0);
    expect(h.registry.get(room.code)).toBe(room);
  });

  it('borra en el acto las salas que se han quedado vacías', () => {
    const h = harness();
    const { room, members } = lobby(2, h);
    for (const m of members) room.leave(m.id);
    expect(h.registry.sweep()).toBe(1);
  });

  it('con el cupo lleno no se crean más salas', () => {
    const changes: (GameEvent[] | null)[] = [];
    const registry = new RoomRegistry({
      listener: { changed: (_r, e) => changes.push(e), removed: () => {} },
      maxRooms: 2,
    });
    registry.create('Ana');
    registry.create('Bea');
    expect(registry.create('Carlos')).toBe('SERVER_FULL');
    expect(registry.size).toBe(2);
  });
});

describe('bots', () => {
  /** Sala con un humano de anfitrión y `bots` bots. */
  const withBots = (bots: number, h = harness()) => {
    const setup = lobby(1, h);
    for (let i = 0; i < bots; i++) expect(setup.room.addBot(setup.members[0]!.id)).toBeNull();
    return setup;
  };

  it('el anfitrión los añade, y cuentan para poder empezar', () => {
    const { room, members } = withBots(2);
    expect(room.members).toHaveLength(3);
    expect(room.members.filter((m) => m.bot)).toHaveLength(2);
    expect(room.startBlocker()).toBeNull();
    expect(room.viewFor(members[0]!.id).members.filter((m) => m.bot && m.connected)).toHaveLength(2);
  });

  it('cada bot tiene su nombre y su sitio; no caben más de seis', () => {
    const { room, members } = withBots(5);
    expect(new Set(room.members.map((m) => m.name)).size).toBe(6);
    expect(room.addBot(members[0]!.id)).toBe('ROOM_FULL');
  });

  it('solo el anfitrión, y solo antes de empezar', () => {
    const { room, members } = withBots(2);
    const guest = room.join('Bea');
    expect(typeof guest).not.toBe('string');
    expect(room.addBot((guest as Member).id)).toBe('NOT_HOST');
    room.start(members[0]!.id);
    expect(room.addBot(members[0]!.id)).toBe('GAME_IN_PROGRESS');
  });

  it('el token de un bot no deja entrar a nadie', () => {
    const { room, members } = withBots(2);
    room.start(members[0]!.id);
    const bot = room.members.find((m) => m.bot)!;
    expect(room.memberByToken(bot.token)).toBeUndefined();
  });

  it('se quitan de la sala como a cualquiera', () => {
    const { room, members } = withBots(2);
    const bot = room.members.find((m) => m.bot)!;
    expect(room.kick(members[0]!.id, bot.id)).toBeNull();
    expect(room.members).toHaveLength(2);
  });

  it('juegan solos: una partida de un humano y dos bots llega al final', () => {
    const { room, members } = withBots(2);
    const human = members[0]!.id;
    expect(room.start(human)).toBeNull();

    for (let turn = 0; turn < 300 && game(room).phase !== 'finished'; turn++) {
      if (current(room) === human && game(room).phase === 'awaitingReveal') {
        playUntilSettled(room);
        if (game(room).phase === 'awaitingReturn') room.act(human, { type: 'CONFIRM_RETURN' });
      } else {
        vi.advanceTimersByTime(BOT_TIME);
      }
    }
    expect(game(room).phase).toBe('finished');
    expect(game(room).winner).not.toBeNull();
    // Nadie se ha quedado sin jugar su turno.
    expect(game(room).log.some((e) => e.type === 'skip')).toBe(false);
  });

  it('el bot piensa antes de jugar: no responde en el mismo instante', () => {
    const { room, members } = withBots(2);
    room.start(members[0]!.id);
    // Si empieza el humano, se juega su turno: lo que se mide es la pausa del bot.
    if (current(room) === members[0]!.id) {
      playUntilSettled(room);
      room.act(members[0]!.id, { type: 'CONFIRM_RETURN' });
    }
    expect(room.member(current(room))?.bot).toBe(true);
    const before = JSON.stringify(game(room));
    vi.advanceTimersByTime(500);
    expect(JSON.stringify(game(room))).toBe(before);
    vi.advanceTimersByTime(BOT_TIME);
    expect(JSON.stringify(game(room))).not.toBe(before);
  });

  it('si alguien se cae, a los 60 s juega un bot por él; al volver, lo recupera', () => {
    const { room, members } = started(3);
    const other = members.find((m) => m.id !== room.hostId)!;
    const playedByBot = () => room.viewFor(room.hostId).members.find((m) => m.id === other.id)?.playedByBot;

    room.disconnect(other.id);
    expect(playedByBot()).toBe(false);
    vi.advanceTimersByTime(59_000);
    expect(playedByBot()).toBe(false);
    vi.advanceTimersByTime(2_000);
    expect(playedByBot()).toBe(true);

    room.connect(other.id);
    expect(playedByBot()).toBe(false);
  });

  it('el relevo automático se puede desactivar', () => {
    const { room, members } = lobby(3);
    room.configure(members[0]!.id, { botTakeoverSeconds: 0 });
    room.start(members[0]!.id);
    room.disconnect(members[1]!.id);
    vi.advanceTimersByTime(30 * 60_000);
    expect(room.viewFor(members[0]!.id).members[1]?.playedByBot).toBe(false);
  });

  it('el anfitrión puede meter el bot sin esperar, pero no por quien está jugando', () => {
    const { room, members } = started(3);
    const other = members.find((m) => m.id !== room.hostId)!;
    expect(room.substitute(room.hostId, other.id)).toBe('INVALID_MEMBER');

    room.disconnect(other.id);
    expect(room.substitute(other.id, other.id)).toBe('NOT_HOST');
    expect(room.substitute(room.hostId, other.id)).toBeNull();
    expect(room.viewFor(room.hostId).members.find((m) => m.id === other.id)?.playedByBot).toBe(true);
    expect(room.substitute(room.hostId, other.id)).toBe('INVALID_MEMBER');
  });

  it('el nivel de los bots se configura en la sala', () => {
    const { room, members } = lobby(3);
    expect(room.configure(members[0]!.id, { botLevel: 'imposible' })).toBe('INVALID_CONFIG');
    expect(room.configure(members[0]!.id, { botTakeoverSeconds: 5 })).toBe('INVALID_CONFIG');
    expect(room.configure(members[0]!.id, { botLevel: 'hard', botTakeoverSeconds: 30 })).toBeNull();
    expect(room.config).toMatchObject({ botLevel: 'hard', botTakeoverSeconds: 30 });
  });

  it('una sala en la que solo quedan bots se barre, y se lleva sus temporizadores', () => {
    const h = harness();
    const { room, members } = withBots(2, h);
    room.start(members[0]!.id);
    expect(room.leave(members[0]!.id)).toBeNull();

    expect(room.isAbandoned()).toBe(true);
    expect(h.registry.sweep()).toBe(1);
    const quiet = JSON.stringify(room.game);
    vi.advanceTimersByTime(10 * 60_000);
    expect(JSON.stringify(room.game)).toBe(quiet);
  });
});
