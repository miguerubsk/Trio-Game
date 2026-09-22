import { connected, SEVENS, type Value } from './cards';
import type { Rng } from './rng';
import type { Action, End, GameEvent, PlayerId, RevealFrom } from './types';
import type { PlayerView } from './view';

/*
 * Un jugador automático que solo sabe lo que sabría cualquiera sentado a la
 * mesa: parte de la vista redactada y de los eventos públicos, nunca del
 * estado. Si alguna vez se le pasara el GameState, sabría dónde está cada
 * carta y el juego dejaría de tener sentido.
 */

export type BotLevel = 'easy' | 'normal' | 'hard';

/** Probabilidad de olvidar cada recuerdo al empezar un turno. */
const FORGET: Record<BotLevel, number> = { easy: 0.3, normal: 0.12, hard: 0 };

export interface BotMemory {
  /** Lo que recuerda de cada hueco del centro; null = no lo sabe o está vacío. */
  center: (Value | null)[];
  /** Lo mismo por posición de la mano de cada jugador. */
  hands: Record<PlayerId, (Value | null)[]>;
}

export interface Bot {
  readonly level: BotLevel;
  readonly memory: BotMemory;
  /** Apunta lo que acaba de pasar a la vista de todos. */
  observe(view: PlayerView, events: GameEvent[]): void;
  /** Qué jugaría ahora, o null si no le toca nada. */
  decide(view: PlayerView): Action | null;
}

interface Option {
  /** Identifica la carta, para no contar dos veces la misma. */
  key: string;
  action: Action;
  value: Value | null;
}

export const createBot = (level: BotLevel, rng: Rng): Bot => new MemoryBot(level, rng);

class MemoryBot implements Bot {
  readonly memory: BotMemory = { center: [], hands: {} };
  /** De dónde salieron las cartas que siguen boca arriba en esta jugada. */
  private pending: RevealFrom[] = [];

  constructor(
    readonly level: BotLevel,
    private readonly rng: Rng,
  ) {}

  observe(view: PlayerView, events: GameEvent[]): void {
    for (const event of events) this.apply(event, view);
    this.sync(view);
  }

  decide(view: PlayerView): Action | null {
    if (view.legal.confirm) return { type: 'CONFIRM_RETURN' };
    if (view.legal.swap) return this.swap(view);
    if (!view.legal.reveal) return null;
    return this.reveal(view);
  }

  // ── Recuerdo ────────────────────────────────────────────────────────────

  private apply(event: GameEvent, view: PlayerView): void {
    switch (event.type) {
      case 'reveal':
        this.pending.push(event.from);
        this.record(event.from, event.value);
        return;
      case 'collect':
        // El trío se lleva justo las cartas que estaban boca arriba.
        this.forget(this.pending);
        this.pending = [];
        return;
      case 'return':
      case 'skip':
        this.pending = [];
        return;
      case 'turn':
        this.decay();
        return;
      case 'swapResolved':
        // Las dos manos cambian y se reordenan: lo que recordaba de ellas ya no vale.
        if (event.swapped) {
          for (const p of view.players) if (p.team === event.team) this.memory.hands[p.id] = [];
        }
        return;
      default:
        return;
    }
  }

  private record(from: RevealFrom, value: Value): void {
    if (from.kind === 'center') this.memory.center[from.slot] = value;
    else this.hand(from.playerId)[from.index] = value;
  }

  /** Quita de la memoria las cartas que se retiran, que la mano se compacta. */
  private forget(cards: RevealFrom[]): void {
    const byPlayer = new Map<PlayerId, number[]>();
    for (const card of cards) {
      if (card.kind === 'center') this.memory.center[card.slot] = null;
      else byPlayer.set(card.playerId, [...(byPlayer.get(card.playerId) ?? []), card.index]);
    }
    for (const [playerId, indexes] of byPlayer) {
      const hand = this.hand(playerId);
      for (const index of [...indexes].sort((a, b) => b - a)) hand.splice(index, 1);
    }
  }

  private decay(): void {
    const chance = FORGET[this.level];
    if (chance <= 0) return;
    const fade = (values: (Value | null)[]) => {
      for (let i = 0; i < values.length; i++) if (values[i] !== null && this.rng() < chance) values[i] = null;
    };
    fade(this.memory.center);
    for (const hand of Object.values(this.memory.hands)) fade(hand);
  }

  /** Ajusta el recuerdo a lo que se ve ahora mismo: tamaños, cartas boca arriba y mano propia. */
  private sync(view: PlayerView): void {
    this.memory.center.length = view.center.length;
    view.center.forEach((slot, i) => {
      if (slot.state === 'up') this.memory.center[i] = slot.value;
      else if (slot.state === 'empty' || this.memory.center[i] === undefined) this.memory.center[i] = null;
    });

    for (const player of view.players) {
      const hand = this.hand(player.id);
      hand.length = player.hand.length;
      player.hand.forEach((slot, i) => {
        if (slot.faceUp) hand[i] = slot.value;
        else if (hand[i] === undefined) hand[i] = null;
      });
    }
    // La mano propia se conoce entera, y además ordenada.
    this.memory.hands[view.me] = view.myHand.map((card) => card.value);
  }

  private hand(playerId: PlayerId): (Value | null)[] {
    const hand = this.memory.hands[playerId] ?? [];
    this.memory.hands[playerId] = hand;
    return hand;
  }

  // ── Decisión ────────────────────────────────────────────────────────────

  /** Las cartas que puede voltear ahora, con su valor si lo recuerda. */
  private options(view: PlayerView): Option[] {
    const legal = view.legal.reveal;
    if (!legal) return [];
    const out: Option[] = [];

    for (const slot of legal.centerSlots) {
      out.push({
        key: `c${slot}`,
        action: { type: 'REVEAL_CENTER', slot },
        value: this.memory.center[slot] ?? null,
      });
    }

    for (const targetId of legal.targets) {
      const player = view.players.find((p) => p.id === targetId);
      if (!player) continue;
      const hand = this.hand(targetId);
      for (const [end, index] of ends(player.hand.map((slot) => slot.faceUp))) {
        out.push({
          key: `h${targetId}:${index}`,
          action: { type: 'REVEAL_PLAYER', targetId, end },
          value: hand[index] ?? null,
        });
      }
    }
    return out;
  }

  private reveal(view: PlayerView): Action | null {
    const options = this.options(view);
    if (options.length === 0) return null;
    const unknown = options.filter((o) => o.value === null);

    const target = view.revealed[0]?.value;
    if (target !== undefined) {
      const matches = options.filter((o) => o.value === target);
      if (matches.length > 0) return this.pick(matches).action;
      // Nada seguro: mejor una carta nueva, que al menos enseña algo a todos.
      return this.pick(unknown.length > 0 ? unknown : options).action;
    }

    // Turno nuevo: con tres cartas conocidas del mismo valor, el trío es seguro.
    const sure = this.sureTrio(options, view);
    if (sure) return sure;
    return this.pick(unknown.length > 0 ? unknown : options).action;
  }

  /**
   * De los tríos seguros, primero el que gana: el de sietes, y en picante el
   * que conecta con uno que ya tiene su lado de la mesa.
   */
  private sureTrio(options: Option[], view: PlayerView): Action | null {
    const byValue = new Map<Value, Option[]>();
    for (const option of options) {
      if (option.value === null) continue;
      byValue.set(option.value, [...(byValue.get(option.value) ?? []), option]);
    }
    const won = sideTrios(view);
    const rank = (value: Value) =>
      value === SEVENS ? 0 : view.mode === 'spicy' && won.some((w) => connected(w, value)) ? 1 : 2;
    const sure = [...byValue].filter(([, group]) => group.length >= 3).sort(([a], [b]) => rank(a) - rank(b));
    const best = sure[0];
    return best ? this.pick(best[1]).action : null;
  }

  /**
   * Da una carta repetida si la tiene: así su pareja sabe que entre los dos hay
   * dos iguales, que es de lo poco que se pueden contar.
   */
  private swap(view: PlayerView): Action {
    const values = view.myHand.map((card) => card.value);
    if (values.length === 0) return { type: 'SWAP_PASS' };
    const duplicate = values.findIndex((value, i) => values.indexOf(value) !== i);
    return { type: 'SWAP_CHOOSE', handIndex: duplicate >= 0 ? duplicate : 0 };
  }

  private pick<T>(options: T[]): T {
    return options[Math.floor(this.rng() * options.length)] as T;
  }
}

/** Los tríos que cuentan para su victoria: los suyos, o los de su pareja también. */
function sideTrios(view: PlayerView): Value[] {
  const me = view.players.find((p) => p.id === view.me);
  if (!me) return [];
  if (!view.teams || me.team === null) return me.trios;
  return view.players.filter((p) => p.team === me.team).flatMap((p) => p.trios);
}

/** Posiciones de la carta oculta más baja y más alta, que son las que se pueden pedir. */
function ends(faceUp: boolean[]): [End, number][] {
  let lowest = -1;
  let highest = -1;
  for (let i = 0; i < faceUp.length; i++) {
    if (faceUp[i]) continue;
    if (lowest < 0) lowest = i;
    highest = i;
  }
  if (lowest < 0) return [];
  return lowest === highest ? [['lowest', lowest]] : [['lowest', lowest], ['highest', highest]];
}
