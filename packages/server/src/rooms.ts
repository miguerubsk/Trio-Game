import {
  applyAction,
  BOT_TAKEOVER_SECONDS,
  buildView,
  createBot,
  createGame,
  dealSpec,
  IDLE_SECONDS,
  legalActions,
  MAX_PLAYERS,
  MAX_TEAMS,
  shuffle,
  skipTurn,
  type Action,
  type ActionResult,
  type Bot,
  type ClosedReason,
  type ErrorCode,
  type GameEvent,
  type GameState,
  type GameUpdate,
  type PlayerId,
  type Rng,
  type RoomConfig,
  type RoomErrorCode,
  type RoomView,
  type StartBlocker,
} from '@trio/shared';
import { cryptoRng, newPlayerId, newRoomCode, newToken, tokensMatch } from './session';

export type Failure = RoomErrorCode | ErrorCode;

export interface Member {
  id: PlayerId;
  name: string;
  token: string;
  /** Se añadió como bot: no hay nadie detrás. */
  bot: boolean;
  /** Quién juega ahora este asiento: null = la persona de siempre. */
  brain: Bot | null;
  /** Cuenta atrás para que un bot releve a quien se ha caído. */
  takeover: ReturnType<typeof setTimeout> | null;
  /** Equipo elegido en la sala; al empezar en modo Equipos pasa a ser el asignado. */
  team: number | null;
  /** Conexiones abiertas: el mismo jugador puede tener varias pestañas. */
  connections: number;
  /** Expulsado o marchado a mitad de partida. Sigue sentado para que su mano no desaparezca. */
  gone: boolean;
}

export interface RoomListener {
  /** La sala ha cambiado. `events` es null si la partida no se ha movido. */
  changed(room: Room, events: GameEvent[] | null): void;
  /** Un jugador deja de pertenecer a la sala. */
  removed(room: Room, member: Member, reason: ClosedReason): void;
}

interface RoomDeps {
  rng: Rng;
  now: () => number;
  listener: RoomListener;
}

const CONFIRM: Action = { type: 'CONFIRM_RETURN' };
const PASS: Action = { type: 'SWAP_PASS' };

/** Lo que «piensa» un bot antes de jugar, para que la mesa pueda seguirle. */
const BOT_DELAY_MS = { reveal: 1_200, swap: 1_500, confirm: 5_000 };

/** Nombres de los bots, en orden. */
const BOT_NAMES = ['Robotina', 'Chip', 'Tuerca', 'Bit', 'Circuito', 'Chispa'];
/** Tope de jugadas automáticas encadenadas: basta con dar una vuelta a la mesa. */
const AUTO_STEP_LIMIT = MAX_PLAYERS * 4;

/**
 * Una sala: la lista de jugadores, su configuración y, si se está jugando, la
 * partida. No sabe nada de sockets; avisa de cada cambio a su listener.
 */
export class Room {
  hostId: PlayerId = '';
  status: 'lobby' | 'playing' = 'lobby';
  config: RoomConfig = {
    mode: 'simple',
    idleSeconds: IDLE_SECONDS.default,
    botLevel: 'normal',
    botTakeoverSeconds: BOT_TAKEOVER_SECONDS.default,
  };
  readonly members: Member[] = [];
  game: GameState | null = null;
  lastActivity: number;
  autoActionAt: number | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private timerPhase: GameState['phase'] | null = null;
  private botTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    readonly code: string,
    private readonly deps: RoomDeps,
  ) {
    this.lastActivity = deps.now();
  }

  member(id: PlayerId): Member | undefined {
    return this.members.find((m) => m.id === id);
  }

  /** Un jugador que sigue en la sala (no expulsado ni marchado). */
  active(id: PlayerId): Member | undefined {
    const m = this.member(id);
    return m && !m.gone ? m : undefined;
  }

  memberByToken(token: string): Member | undefined {
    // Un bot no tiene a quién dejar entrar: su token no abre nada.
    return this.members.find((m) => !m.gone && !m.bot && tokensMatch(m.token, token));
  }

  /** La sala ya no tiene a nadie que pueda volver: los bots solos no cuentan. */
  isAbandoned(): boolean {
    return this.members.every((m) => m.gone || m.bot);
  }

  // ── Sala ────────────────────────────────────────────────────────────────

  /** `name` llega ya normalizado. */
  join(name: string): Member | Failure {
    if (this.status !== 'lobby') return 'GAME_IN_PROGRESS';
    if (this.members.length >= MAX_PLAYERS) return 'ROOM_FULL';
    const key = name.toLocaleLowerCase('es');
    if (this.members.some((m) => m.name.toLocaleLowerCase('es') === key)) return 'NAME_TAKEN';

    const member: Member = {
      id: newPlayerId(),
      name,
      token: newToken(),
      bot: false,
      brain: null,
      takeover: null,
      team: null,
      connections: 0,
      gone: false,
    };
    this.members.push(member);
    if (this.members.length === 1) this.hostId = member.id;
    this.touch();
    this.notify(null);
    return member;
  }

  connect(id: PlayerId): void {
    const m = this.active(id);
    if (!m) return;
    m.connections++;
    this.touch();
    this.cancelTakeover(m);
    // Al volver, recupera su asiento: el bot que jugaba por él se retira.
    const relieved = m.brain !== null && !m.bot;
    if (relieved) m.brain = null;
    if (m.connections === 1 || relieved) this.notify(null);
  }

  disconnect(id: PlayerId): void {
    const m = this.active(id);
    if (!m || m.connections === 0) return;
    m.connections--;
    if (m.connections > 0) return;
    // Un anfitrión caído no debe dejar la sala sin nadie que pueda empezar o expulsar.
    if (m.id === this.hostId) this.passHost(true);
    this.scheduleTakeover(m);
    this.notify(null);
  }

  leave(id: PlayerId): Failure | null {
    const m = this.active(id);
    if (!m) return 'NOT_IN_ROOM';
    this.drop(m, 'left');
    return null;
  }

  kick(actor: PlayerId, targetId: unknown): Failure | null {
    if (actor !== this.hostId) return 'NOT_HOST';
    const target = typeof targetId === 'string' ? this.active(targetId) : undefined;
    if (!target || target.id === actor) return 'INVALID_MEMBER';
    this.drop(target, 'kicked');
    return null;
  }

  configure(
    actor: PlayerId,
    patch: { mode?: unknown; idleSeconds?: unknown; botLevel?: unknown; botTakeoverSeconds?: unknown },
  ): Failure | null {
    if (actor !== this.hostId) return 'NOT_HOST';
    if (this.status !== 'lobby') return 'GAME_IN_PROGRESS';

    const next = { ...this.config };
    if (patch.mode !== undefined) {
      if (patch.mode !== 'simple' && patch.mode !== 'teams') return 'INVALID_CONFIG';
      next.mode = patch.mode;
    }
    if (patch.idleSeconds !== undefined) {
      const s = patch.idleSeconds;
      if (typeof s !== 'number' || !Number.isInteger(s) || s < IDLE_SECONDS.min || s > IDLE_SECONDS.max) {
        return 'INVALID_CONFIG';
      }
      next.idleSeconds = s;
    }
    if (patch.botLevel !== undefined) {
      const level = patch.botLevel;
      if (level !== 'easy' && level !== 'normal' && level !== 'hard') return 'INVALID_CONFIG';
      next.botLevel = level;
    }
    if (patch.botTakeoverSeconds !== undefined) {
      const s = patch.botTakeoverSeconds;
      const valid =
        typeof s === 'number' &&
        Number.isInteger(s) &&
        (s === BOT_TAKEOVER_SECONDS.never || (s >= BOT_TAKEOVER_SECONDS.min && s <= BOT_TAKEOVER_SECONDS.max));
      if (!valid) return 'INVALID_CONFIG';
      next.botTakeoverSeconds = s;
    }
    this.config = next;
    this.touch();
    this.notify(null);
    return null;
  }

  chooseTeam(actor: PlayerId, team: unknown): Failure | null {
    const m = this.active(actor);
    if (!m) return 'NOT_IN_ROOM';
    if (this.status !== 'lobby') return 'GAME_IN_PROGRESS';
    if (team !== null) {
      if (typeof team !== 'number' || !Number.isInteger(team) || team < 0 || team >= MAX_TEAMS) {
        return 'INVALID_TEAM';
      }
      if (this.members.filter((o) => o.team === team && o.id !== actor).length >= 2) return 'TEAM_FULL';
    }
    m.team = team;
    this.touch();
    this.notify(null);
    return null;
  }

  /** Un bot más en la mesa. Cuenta como jugador para repartir y para empezar. */
  addBot(actor: PlayerId): Failure | null {
    if (actor !== this.hostId) return 'NOT_HOST';
    if (this.status !== 'lobby') return 'GAME_IN_PROGRESS';
    if (this.members.length >= MAX_PLAYERS) return 'ROOM_FULL';

    const taken = new Set(this.members.map((m) => m.name.toLocaleLowerCase('es')));
    const name = BOT_NAMES.find((n) => !taken.has(n.toLocaleLowerCase('es')));
    if (!name) return 'ROOM_FULL';

    this.members.push({
      id: newPlayerId(),
      name,
      token: newToken(),
      bot: true,
      brain: null,
      takeover: null,
      team: null,
      connections: 0,
      gone: false,
    });
    this.touch();
    this.notify(null);
    return null;
  }

  /** El anfitrión no espera al relevo automático: que juegue ya un bot por él. */
  substitute(actor: PlayerId, targetId: unknown): Failure | null {
    if (actor !== this.hostId) return 'NOT_HOST';
    if (this.status !== 'playing') return 'NOT_PLAYING';
    const target = typeof targetId === 'string' ? this.member(targetId) : undefined;
    if (!target || target.bot || target.brain || (target.connections > 0 && !target.gone)) {
      return 'INVALID_MEMBER';
    }
    this.takeOver(target);
    return null;
  }

  startBlocker(): StartBlocker | null {
    const count = this.members.length;
    if (!dealSpec(this.config.mode, count)) return 'PLAYER_COUNT';
    if (this.config.mode === 'teams' && this.members.some((m) => m.team !== null && m.team >= count / 2)) {
      return 'TEAMS_UNBALANCED';
    }
    return null;
  }

  // ── Partida ─────────────────────────────────────────────────────────────

  start(actor: PlayerId): Failure | null {
    if (actor !== this.hostId) return 'NOT_HOST';
    if (this.status !== 'lobby') return 'GAME_IN_PROGRESS';
    if (this.startBlocker()) return 'CANNOT_START';

    const seats = this.config.mode === 'teams' ? this.seatTeams() : [...this.members];
    this.game = createGame({
      players: seats.map((m) => ({ id: m.id, name: m.name })),
      mode: this.config.mode,
      rng: this.deps.rng,
    });
    this.status = 'playing';
    for (const m of this.members) if (m.bot) m.brain = this.newBrain();
    this.touch();
    this.advance([...this.game.log]);
    return null;
  }

  act(actor: PlayerId, action: Action): Failure | null {
    if (this.status !== 'playing' || !this.game) return 'NOT_PLAYING';
    if (!this.active(actor)) return 'NOT_IN_ROOM';
    const result = applyAction(this.game, actor, action);
    if (!result.ok) return result.error;
    this.game = result.state;
    this.touch();
    this.advance(result.events);
    return null;
  }

  /** Vuelta a la sala, al terminar o abandonando la partida. Los que se fueron salen del todo. */
  reset(actor: PlayerId): Failure | null {
    if (actor !== this.hostId) return 'NOT_HOST';
    if (this.status !== 'playing') return 'NOT_PLAYING';
    this.clearTimer();
    this.clearBotTimer();
    for (const m of this.members) {
      m.brain = null;
      this.cancelTakeover(m);
    }
    this.game = null;
    this.status = 'lobby';
    for (let i = this.members.length - 1; i >= 0; i--) {
      if (this.members[i]?.gone) this.members.splice(i, 1);
    }
    this.touch();
    this.notify(null);
    return null;
  }

  // ── Vistas ──────────────────────────────────────────────────────────────

  viewFor(me: PlayerId): RoomView {
    return {
      code: this.code,
      me,
      hostId: this.hostId,
      status: this.status,
      config: { ...this.config },
      members: this.members.map((m) => ({
        id: m.id,
        name: m.name,
        connected: m.bot || m.connections > 0,
        bot: m.bot,
        playedByBot: !m.bot && m.brain !== null,
        gone: m.gone,
        team: m.team,
      })),
      startBlocker: this.status === 'lobby' ? this.startBlocker() : null,
      autoActionAt: this.autoActionAt,
    };
  }

  gameUpdate(me: PlayerId, events: GameEvent[]): GameUpdate | null {
    if (!this.game || !this.game.players.some((p) => p.id === me)) return null;
    return { view: buildView(this.game, me), events };
  }

  /** Cierra la sala. Con `notify`, los jugadores conectados reciben el aviso. */
  dispose(notify: boolean): void {
    this.clearTimer();
    this.clearBotTimer();
    for (const m of this.members) this.cancelTakeover(m);
    if (!notify) return;
    for (const m of this.members) {
      if (!m.gone && m.connections > 0) this.deps.listener.removed(this, m, 'expired');
    }
  }

  // ── Interno ─────────────────────────────────────────────────────────────

  private drop(m: Member, reason: ClosedReason): void {
    if (this.status === 'lobby') {
      this.members.splice(this.members.indexOf(m), 1);
    } else {
      m.gone = true;
    }
    this.deps.listener.removed(this, m, reason);
    m.connections = 0;
    this.cancelTakeover(m);
    // Su mano sigue en la mesa, así que la juega un bot; salvo que la sala
    // haya desactivado el relevo, y entonces se le saltan los turnos.
    if (this.status === 'playing' && !m.brain && this.config.botTakeoverSeconds > 0) {
      m.brain = this.newBrain();
    }
    if (m.id === this.hostId) this.passHost(false);
    this.touch();
    if (this.status === 'playing') this.advance([]);
    else this.notify(null);
  }

  private passHost(onlyConnected: boolean): void {
    const candidates = this.members.filter((m) => !m.gone && m.id !== this.hostId);
    const next = candidates.find((m) => m.connections > 0) ?? (onlyConnected ? undefined : candidates[0]);
    if (next) this.hostId = next.id;
  }

  /** createGame asigna el equipo `asiento % nº de equipos`: se sienta a las parejas alternadas. */
  private seatTeams(): Member[] {
    const teamCount = this.members.length / 2;
    const pairs: Member[][] = Array.from({ length: teamCount }, () => []);
    for (const m of this.members) if (m.team !== null) pairs[m.team]?.push(m);
    const free = shuffle(
      this.members.filter((m) => m.team === null),
      this.deps.rng,
    );
    pairs.forEach((pair, team) => {
      while (pair.length < 2) pair.push(free.shift() as Member);
      for (const m of pair) m.team = team;
    });
    return [...pairs.map((p) => p[0] as Member), ...pairs.map((p) => p[1] as Member)];
  }

  /**
   * Tras cada cambio de la partida: juega en nombre de quien ya no está (salta
   * su turno, confirma su jugada o pasa su intercambio), programa la
   * salvaguarda de inactividad y avisa.
   */
  private advance(events: GameEvent[]): void {
    const all = [...events];
    for (let i = 0; i < AUTO_STEP_LIMIT; i++) {
      const step = this.autoStep();
      if (!step?.ok) break;
      this.game = step.state;
      all.push(...step.events);
    }
    this.watch(all);
    this.schedule();
    this.scheduleBot();
    this.notify(all);
  }

  private autoStep(): ActionResult | null {
    const g = this.game;
    if (!g || g.phase === 'finished' || this.isAbandoned()) return null;
    // Solo por quien no está y no tiene bot que le juegue.
    const gone = this.members.filter((m) => m.gone && !m.brain).map((m) => m.id);

    if (g.phase === 'teamSwap') {
      const pending = gone.find((id) => legalActions(g, id).swap !== null);
      return pending ? applyAction(g, pending, PASS) : null;
    }
    const current = g.players[g.currentPlayerIndex]?.id;
    if (current === undefined || !gone.includes(current)) return null;
    return g.phase === 'awaitingReveal' ? skipTurn(g) : applyAction(g, current, CONFIRM);
  }

  /** Un cerebro nuevo, con el nivel que tenga puesto la sala. */
  private newBrain(): Bot {
    return createBot(this.config.botLevel, this.deps.rng);
  }

  private scheduleTakeover(m: Member): void {
    this.cancelTakeover(m);
    const seconds = this.config.botTakeoverSeconds;
    if (m.bot || m.brain || seconds <= 0 || this.status !== 'playing') return;
    m.takeover = setTimeout(() => this.takeOver(m), seconds * 1000);
  }

  private cancelTakeover(m: Member): void {
    if (m.takeover) clearTimeout(m.takeover);
    m.takeover = null;
  }

  /** Un bot se sienta donde falta alguien y sigue la partida desde donde está. */
  private takeOver(m: Member): void {
    this.cancelTakeover(m);
    if (m.brain || m.bot || this.status !== 'playing' || !this.game) return;
    m.brain = this.newBrain();
    this.advance([]);
  }

  /** Los bots miran la partida con la misma vista redactada que cualquiera. */
  private watch(events: GameEvent[]): void {
    const g = this.game;
    if (!g) return;
    for (const m of this.members) {
      if (m.brain && g.players.some((p) => p.id === m.id)) m.brain.observe(buildView(g, m.id), events);
    }
  }

  /** El primer bot que tenga algo que hacer, con su pausa para «pensar». */
  private scheduleBot(): void {
    this.clearBotTimer();
    const g = this.game;
    if (!g || g.phase === 'finished') return;

    for (const m of this.members) {
      if (!m.brain) continue;
      const legal = legalActions(g, m.id);
      const delay = legal.confirm
        ? BOT_DELAY_MS.confirm
        : legal.swap
          ? BOT_DELAY_MS.swap
          : legal.reveal
            ? BOT_DELAY_MS.reveal
            : null;
      if (delay === null) continue;
      this.botTimer = setTimeout(() => this.playBot(m.id), delay);
      return;
    }
  }

  private playBot(id: PlayerId): void {
    this.botTimer = null;
    const m = this.member(id);
    const g = this.game;
    if (!m?.brain || !g || g.phase === 'finished') return;

    const action = m.brain.decide(buildView(g, id));
    const played = action ? applyAction(g, id, action) : null;
    // Un bot que no sepa qué hacer no puede dejar la partida colgada.
    const result = played?.ok ? played : this.fallback(id);
    if (result?.ok) {
      this.game = result.state;
      this.advance(result.events);
    }
  }

  private fallback(id: PlayerId): ActionResult | null {
    const g = this.game;
    if (!g) return null;
    const legal = legalActions(g, id);
    if (legal.confirm) return applyAction(g, id, CONFIRM);
    if (legal.swap) return applyAction(g, id, PASS);
    if (legal.reveal) return skipTurn(g);
    return null;
  }

  private clearBotTimer(): void {
    if (this.botTimer) clearTimeout(this.botTimer);
    this.botTimer = null;
  }

  /**
   * La salvaguarda cuenta desde que empieza la fase: las respuestas parciales a
   * un intercambio no la reinician. Nunca salta un turno por sí sola.
   */
  private schedule(): void {
    const phase = this.game?.phase ?? null;
    const waits = phase === 'awaitingReturn' || phase === 'teamSwap';
    if (waits && this.timer && this.timerPhase === phase) return;
    this.clearTimer();
    if (!waits) return;
    const ms = this.config.idleSeconds * 1000;
    this.timerPhase = phase;
    this.autoActionAt = this.deps.now() + ms;
    this.timer = setTimeout(() => this.expire(), ms);
  }

  private expire(): void {
    this.timer = null;
    this.timerPhase = null;
    this.autoActionAt = null;
    const events: GameEvent[] = [];
    const apply = (actor: PlayerId, action: Action) => {
      if (!this.game) return;
      const result = applyAction(this.game, actor, action);
      if (!result.ok) return;
      this.game = result.state;
      events.push(...result.events);
    };

    const g = this.game;
    if (g?.phase === 'awaitingReturn') {
      const current = g.players[g.currentPlayerIndex];
      if (current) apply(current.id, CONFIRM);
    } else if (g?.phase === 'teamSwap') {
      for (const p of g.players) {
        if (this.game && legalActions(this.game, p.id).swap) apply(p.id, PASS);
      }
    }
    this.advance(events);
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.timerPhase = null;
    this.autoActionAt = null;
  }

  private touch(): void {
    this.lastActivity = this.deps.now();
  }

  private notify(events: GameEvent[] | null): void {
    this.deps.listener.changed(this, events);
  }
}

export const ROOM_TTL_MS = 2 * 60 * 60 * 1000;
export const MAX_ROOMS = 500;

export interface RegistryOptions {
  listener: RoomListener;
  /** Para barajar. Por defecto criptográfico; los tests inyectan uno sembrado. */
  rng?: Rng;
  now?: () => number;
  /** Una sala sin actividad durante este tiempo se borra. */
  ttlMs?: number;
  maxRooms?: number;
}

/** Todas las salas, en memoria: reiniciar el servidor pierde las partidas en curso. */
export class RoomRegistry {
  private readonly rooms = new Map<string, Room>();
  private readonly deps: RoomDeps;
  private readonly ttlMs: number;
  private readonly maxRooms: number;

  constructor(opts: RegistryOptions) {
    this.deps = { listener: opts.listener, rng: opts.rng ?? cryptoRng, now: opts.now ?? Date.now };
    this.ttlMs = opts.ttlMs ?? ROOM_TTL_MS;
    this.maxRooms = opts.maxRooms ?? MAX_ROOMS;
  }

  get size(): number {
    return this.rooms.size;
  }

  get(code: string): Room | undefined {
    return this.rooms.get(code);
  }

  /** `hostName` llega ya normalizado. */
  create(hostName: string): { room: Room; host: Member } | Failure {
    if (this.rooms.size >= this.maxRooms) this.sweep();
    if (this.rooms.size >= this.maxRooms) return 'SERVER_FULL';

    let code = newRoomCode();
    while (this.rooms.has(code)) code = newRoomCode();
    const room = new Room(code, this.deps);
    const host = room.join(hostName);
    if (typeof host === 'string') return host;
    this.rooms.set(code, room);
    return { room, host };
  }

  /** Borra las salas abandonadas o sin actividad reciente. Devuelve cuántas. */
  sweep(): number {
    const now = this.deps.now();
    let removed = 0;
    for (const [code, room] of this.rooms) {
      if (room.isAbandoned() || now - room.lastActivity > this.ttlMs) {
        this.rooms.delete(code);
        room.dispose(true);
        removed++;
      }
    }
    return removed;
  }

  close(): void {
    for (const room of this.rooms.values()) room.dispose(false);
    this.rooms.clear();
  }
}
