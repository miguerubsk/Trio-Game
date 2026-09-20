import { describe, expect, it } from 'vitest';
import type { GameMode, Value } from './cards';
import { applyAction } from './engine';
import { handOf, hiddenIndex, triosOfSide, valueOf } from './helpers';
import { legalActions } from './legal';
import { mulberry32, type Rng } from './rng';
import { createGame } from './setup';
import type { Action, CardId, GameState, PlayerId } from './types';
import { buildView } from './view';

/*
 * Conductor sin interfaz: juega partidas enteras con movimientos legales al
 * azar y comprueba los invariantes en cada paso. No es un bot para jugar: hace
 * trampas (mira el estado) para que las partidas terminen pronto.
 */

const MAX_STEPS = 20_000;
const SAMPLE_EVERY = 15;
const GAMES_PER_SCENARIO = 12;

const roster = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `J${i}` }));

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function checkInvariants(s: GameState): void {
  // Las 36 cartas están siempre en exactamente un sitio.
  const located: CardId[] = [...Object.values(s.hands).flat(), ...s.center.filter((c) => c !== null)];
  const trioCount = Object.values(s.trios).reduce((sum, t) => sum + t.length, 0);
  check(new Set(located).size === located.length, 'una carta está en dos sitios a la vez');
  check(located.length + trioCount * 3 === 36, `faltan o sobran cartas: ${located.length} + ${trioCount}×3`);

  for (const p of s.players) {
    const values = handOf(s, p.id).map((id) => valueOf(s, id));
    check(values.every((v, i) => i === 0 || (values[i - 1] as Value) <= v), `mano de ${p.id} sin ordenar`);
  }

  // Un valor solo puede estar en un trío, y solo una vez.
  const trioValues = Object.values(s.trios).flat();
  check(new Set(trioValues).size === trioValues.length, 'un valor tiene dos tríos');

  // Las reveladas siguen en su origen y son a lo sumo tres.
  check(s.revealed.length <= 3, 'más de tres cartas reveladas');
  check(new Set(s.revealed.map((r) => r.cardId)).size === s.revealed.length, 'revelada repetida');
  for (const { cardId, origin } of s.revealed) {
    const present =
      origin.kind === 'center' ? s.center[origin.slot] === cardId : handOf(s, origin.playerId).includes(cardId);
    check(present, `la carta revelada ${cardId} no está en su origen`);
  }

  // Coherencia entre la fase y los campos que la acompañan.
  check((s.outcome !== null) === (s.phase === 'awaitingReturn'), 'outcome incoherente con la fase');
  check((s.swap !== null) === (s.phase === 'teamSwap'), 'swap incoherente con la fase');
  check((s.winner !== null) === (s.phase === 'finished'), 'winner incoherente con la fase');
  check(s.currentPlayerIndex >= 0 && s.currentPlayerIndex < s.players.length, 'turno fuera de rango');
  if (s.config.mode === 'teams') check(s.center.length === 0, 'hay centro en modo por equipos');

  const values = s.revealed.map((r) => valueOf(s, r.cardId));
  const allEqual = values.every((v) => v === values[0]);
  if (s.phase === 'awaitingReveal') {
    check(s.revealed.length < 3, 'tres reveladas y el turno sigue abierto');
    if (values.length === 2) check(allEqual, 'dos reveladas distintas y el turno sigue abierto');
  }
  if (s.phase === 'awaitingReturn') {
    check(values.length >= 2, 'jugada cerrada con menos de dos cartas');
    if (s.outcome === 'trio') check(values.length === 3 && allEqual, 'trío que no es un trío');
    else check(!allEqual, 'fallo con todas las cartas iguales');
  }

  if (s.winner) {
    const anySevens = s.winner.playerIds.some((id) => (s.trios[id] ?? []).includes(7));
    const enough = triosOfSide(s, s.winner.playerIds[0] as PlayerId) >= s.config.targetTrios;
    check(anySevens || enough, 'ganador sin trío de sietes ni tríos suficientes');
  }
}

/** El registro de la vista solo lleva el valor de las cartas que siguen boca arriba. */
function checkLogRedaction(s: GameState): void {
  const view = buildView(s, (s.players[0] as { id: PlayerId }).id);
  const shown = view.log.flatMap((e) => (e.type === 'reveal' && 'value' in e ? [e.value] : []));
  const faceUp = view.revealed.map((r) => r.value);
  check(
    JSON.stringify(shown) === JSON.stringify(faceUp),
    `el registro enseña ${JSON.stringify(shown)} con ${JSON.stringify(faceUp)} boca arriba`,
  );
}

/** Todas las acciones que un cliente podría intentar, incluidas las absurdas. */
function everyAttempt(s: GameState): { actor: PlayerId; action: Action }[] {
  const out: { actor: PlayerId; action: Action }[] = [];
  for (const { id: actor } of s.players) {
    for (let slot = -1; slot <= s.center.length; slot++) {
      out.push({ actor, action: { type: 'REVEAL_CENTER', slot } });
    }
    for (const { id: targetId } of s.players) {
      for (const end of ['lowest', 'highest'] as const) {
        out.push({ actor, action: { type: 'REVEAL_PLAYER', targetId, end } });
      }
    }
    out.push({ actor, action: { type: 'CONFIRM_RETURN' } });
    for (let handIndex = -1; handIndex <= 10; handIndex++) {
      out.push({ actor, action: { type: 'SWAP_CHOOSE', handIndex } });
    }
    out.push({ actor, action: { type: 'SWAP_PASS' } });
  }
  return out;
}

function announcedLegal(s: GameState, actor: PlayerId, action: Action): boolean {
  const legal = legalActions(s, actor);
  switch (action.type) {
    case 'REVEAL_CENTER':
      return legal.reveal?.centerSlots.includes(action.slot) ?? false;
    case 'REVEAL_PLAYER':
      return legal.reveal?.targets.includes(action.targetId) ?? false;
    case 'CONFIRM_RETURN':
      return legal.confirm;
    case 'SWAP_CHOOSE':
      return legal.swap !== null && action.handIndex >= 0 && action.handIndex < legal.swap.handSize;
    case 'SWAP_PASS':
      return legal.swap !== null;
  }
}

/** legalActions y applyAction deben coincidir exactamente: ni de más ni de menos. */
function checkLegalityMatchesEngine(s: GameState): void {
  for (const { actor, action } of everyAttempt(s)) {
    const accepted = applyAction(s, actor, action).ok;
    check(
      accepted === announcedLegal(s, actor, action),
      `legalActions y applyAction discrepan (${s.phase}, ${actor}): ${JSON.stringify(action)} → ${accepted}`,
    );
  }
}

function pickAction(s: GameState, rng: Rng, smart: number): { actor: PlayerId; action: Action } {
  const movers = s.players.filter((p) => {
    const l = legalActions(s, p.id);
    return l.reveal !== null || l.confirm || l.swap !== null;
  });
  check(movers.length > 0, `partida atascada en ${s.phase}: nadie puede actuar`);
  const actor = (movers[Math.floor(rng() * movers.length)] as { id: PlayerId }).id;
  const legal = legalActions(s, actor);

  if (legal.confirm) return { actor, action: { type: 'CONFIRM_RETURN' } };
  if (legal.swap) {
    const pass = rng() < 0.3;
    const handIndex = Math.floor(rng() * legal.swap.handSize);
    return { actor, action: pass ? { type: 'SWAP_PASS' } : { type: 'SWAP_CHOOSE', handIndex } };
  }

  const reveal = legal.reveal;
  check(reveal, 'sin acción de revelar');
  const options: { action: Action; value: Value }[] = [];
  for (const slot of reveal.centerSlots) {
    options.push({
      action: { type: 'REVEAL_CENTER', slot },
      value: valueOf(s, s.center[slot] as CardId),
    });
  }
  for (const targetId of reveal.targets) {
    for (const end of ['lowest', 'highest'] as const) {
      const card = handOf(s, targetId)[hiddenIndex(s, targetId, end)] as CardId;
      options.push({ action: { type: 'REVEAL_PLAYER', targetId, end }, value: valueOf(s, card) });
    }
  }
  check(options.length > 0, 'no queda ninguna carta que revelar');

  const first = s.revealed[0];
  const matching = first ? options.filter((o) => o.value === valueOf(s, first.cardId)) : [];
  const pool = matching.length > 0 && rng() < smart ? matching : options;
  return { actor, action: (pool[Math.floor(rng() * pool.length)] as { action: Action }).action };
}

const SCENARIOS: { mode: GameMode; players: number }[] = [
  { mode: 'simple', players: 3 },
  { mode: 'simple', players: 4 },
  { mode: 'simple', players: 5 },
  { mode: 'simple', players: 6 },
  { mode: 'teams', players: 4 },
  { mode: 'teams', players: 6 },
];

describe('fuzz: partidas completas al azar', () => {
  it.each(SCENARIOS)('$mode con $players jugadores', ({ mode, players }) => {
    let finished = 0;
    const seen: Record<string, number> = {};
    for (let game = 0; game < GAMES_PER_SCENARIO; game++) {
      const rng = mulberry32(players * 1000 + game + (mode === 'teams' ? 500 : 0));
      const smart = [0.95, 0.7, 0.95][game % 3] as number;
      let s = createGame({ players: roster(players), mode, rng });

      for (let step = 0; step < MAX_STEPS; step++) {
        checkInvariants(s);
        checkLogRedaction(s);
        if (s.phase === 'finished') break;
        if (step % SAMPLE_EVERY === 0) checkLegalityMatchesEngine(s);

        const { actor, action } = pickAction(s, rng, smart);
        const result = applyAction(s, actor, action);
        check(result.ok, `acción legal rechazada: ${JSON.stringify(action)} → ${!result.ok && result.error}`);
        for (const e of result.events) {
          const key = e.type === 'swapResolved' ? `swap:${e.swapped}` : e.type;
          seen[key] = (seen[key] ?? 0) + 1;
        }
        seen['steps'] = (seen['steps'] ?? 0) + 1;
        s = result.state;
      }

      expect(s.phase, `la partida ${game} no terminó en ${MAX_STEPS} pasos`).toBe('finished');
      for (const p of s.players) expect(applyAction(s, p.id, { type: 'CONFIRM_RETURN' }).ok).toBe(false);
      finished++;
    }
    expect(finished).toBe(GAMES_PER_SCENARIO);

    // Guardas contra una prueba vacía: las partidas deben ejercitar de verdad el motor.
    expect(seen['steps'] ?? 0).toBeGreaterThan(200);
    expect(seen['trio'] ?? 0).toBeGreaterThan(10);
    expect(seen['mismatch'] ?? 0).toBeGreaterThan(10);
    if (mode === 'teams') {
      expect(seen['swap:true'] ?? 0).toBeGreaterThan(5);
      expect(seen['swap:false'] ?? 0).toBeGreaterThan(5);
    }
  }, 120_000);
});
