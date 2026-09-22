import { describe, expect, it } from 'vitest';
import type { LogEntry, Value, Winner } from '@trio/shared';
import { playerView, teamsView } from './fixtures';
import {
  autoActionText,
  blockerText,
  closedText,
  errorText,
  logText,
  statusText,
  winnerText,
  winningValues,
  type Names,
} from './text';

const names: Names = { p0: 'Ana', p1: 'Bea', p2: 'Carlos' };

describe('mensajes de error', () => {
  it('traduce los códigos del servidor y del motor', () => {
    expect(errorText('NAME_TAKEN')).toContain('nombre');
    expect(errorText('NOT_YOUR_TURN')).toBe('No es tu turno.');
    expect(errorText('ROOM_NOT_FOUND')).toContain('código');
  });

  it('dice por qué te has quedado fuera, salvo si te has ido tú', () => {
    expect(closedText('kicked')).toContain('anfitrión');
    expect(closedText('expired')).toContain('inactividad');
    expect(closedText('left')).toBeNull();
  });

  it('explica qué falta para empezar', () => {
    expect(blockerText('PLAYER_COUNT', false)).toContain('entre 3 y 6');
    expect(blockerText('PLAYER_COUNT', true)).toContain('4 o 6');
    expect(blockerText('TEAMS_UNBALANCED', true)).toContain('dos jugadores');
  });
});

describe('registro de jugadas', () => {
  it('cuenta el valor solo si la carta sigue boca arriba', () => {
    const up: LogEntry = { type: 'reveal', by: 'p0', value: 9, from: { kind: 'center', slot: 2 } };
    const down: LogEntry = { type: 'reveal', by: 'p0', from: { kind: 'center', slot: 2 } };
    expect(logText(up, names)).toBe('Ana voltea el hueco 3: 9.');
    expect(logText(down, names)).toBe('Ana volteó el hueco 3.');
  });

  it('dice de quién era la carta', () => {
    expect(logText({ type: 'reveal', by: 'p0', from: { kind: 'hand', playerId: 'p1', index: 0 } }, names)).toBe(
      'Ana volteó una carta de Bea.',
    );
    expect(logText({ type: 'reveal', by: 'p0', from: { kind: 'hand', playerId: 'p0', index: 1 } }, names)).toBe(
      'Ana volteó una carta suya.',
    );
  });

  it('resume el resto de la partida', () => {
    expect(logText({ type: 'turn', playerId: 'p1' }, names)).toBe('Turno de Bea.');
    expect(logText({ type: 'skip', playerId: 'p1' }, names)).toContain('se salta su turno');
    expect(logText({ type: 'mismatch', by: 'p0' }, names)).toBe('No coinciden.');
    expect(logText({ type: 'trio', by: 'p0', value: 4 }, names)).toBe('¡Ana forma un trío de 4!');
    expect(logText({ type: 'return', by: 'p0' }, names)).toContain('vuelven a su sitio');
    // El trío ya se ha contado: recogerlo no añade nada.
    expect(logText({ type: 'collect', by: 'p0', value: 4 }, names)).toBeNull();
  });

  it('anuncia al ganador', () => {
    const solo: Winner = { playerIds: ['p0'], team: null, reason: 'trios' };
    const pair: Winner = { playerIds: ['p0', 'p2'], team: 0, reason: 'sevens' };
    expect(winnerText(solo, names)).toBe('¡Gana Ana!');
    expect(winnerText(pair, names)).toBe('¡Gana el equipo de Ana y Carlos con el trío de sietes!');
    expect(logText({ type: 'gameOver', winner: solo }, names)).toBe('¡Gana Ana!');
  });
});

describe('barra de estado', () => {
  it('cuando te toca, dice qué puedes hacer', () => {
    const status = statusText(playerView(), names);
    expect(status.main).toBe('Te toca');
    expect(status.hint).toContain('más baja');
  });

  it('cuando juega otro, solo dice de quién es el turno', () => {
    expect(statusText(playerView({ currentPlayerId: 'p1' }), names)).toEqual({ main: 'Turno de Bea' });
  });

  it('a mitad de turno dice qué buscar, y cuando solo falta uno lo avisa a todos', () => {
    const one = playerView({ revealed: [{ value: 5, from: { kind: 'center', slot: 0 } }] });
    expect(statusText(one, names)).toEqual({ main: 'Te toca', hint: 'Busca otro 5.' });

    const two = playerView({
      revealed: [
        { value: 5, from: { kind: 'center', slot: 0 } },
        { value: 5, from: { kind: 'hand', playerId: 'p1', index: 0 } },
      ],
    });
    expect(statusText(two, names).main).toBe('¡Te falta uno!');
    expect(statusText(two, names).hint).toContain('tercer 5');
    expect(statusText({ ...two, currentPlayerId: 'p1' }, names)).toEqual({
      main: 'Turno de Bea',
      hint: 'Lleva dos 5: le falta uno.',
    });
  });

  it('con la jugada cerrada, distingue trío de fallo y quién continúa', () => {
    const trio = playerView({
      phase: 'awaitingReturn',
      outcome: 'trio',
      revealed: [{ value: 7, from: { kind: 'center', slot: 0 } }],
      legal: { reveal: null, confirm: true, swap: null },
    });
    expect(statusText(trio, names).main).toBe('¡Trío de 7!');
    expect(statusText(trio, names).hint).toContain('continuar');

    const fail = playerView({ phase: 'awaitingReturn', outcome: 'mismatch', currentPlayerId: 'p1' });
    expect(statusText(fail, names).main).toBe('No coinciden.');
    expect(statusText(fail, names).hint).toContain('Bea');
  });

  it('al terminar, anuncia al ganador', () => {
    const view = playerView({
      phase: 'finished',
      winner: { playerIds: ['p1'], team: null, reason: 'sevens' },
    });
    expect(statusText(view, names).main).toContain('Gana Bea');
  });
});

describe('intercambio', () => {
  it('la barra no repite lo que ya dice el panel', () => {
    const view = playerView({ phase: 'teamSwap', legal: { reveal: null, confirm: false, swap: { handSize: 3 } } });
    expect(statusText(view, names)).toEqual({ main: 'Intercambio entre compañeros.' });
  });

  it('cuenta quién intercambia y si hubo cambio, pero no qué carta', () => {
    expect(logText({ type: 'swapRequested', reason: 'start', teams: [0, 1] }, names)).toContain(
      'cada pareja',
    );
    expect(logText({ type: 'swapRequested', reason: 'trio', teams: [1] }, names)).toContain(
      'Los demás equipos',
    );
    expect(logText({ type: 'swapResolved', team: 0, swapped: true }, names)).toBe(
      'El equipo 1 intercambia una carta.',
    );
    expect(logText({ type: 'swapResolved', team: 1, swapped: false }, names)).toBe(
      'El equipo 2 no intercambia.',
    );
  });
});

describe('modo picante', () => {
  const names = { p0: 'Ana', p1: 'Bea', p2: 'Carlos', p3: 'Dani' };
  const withTrios = (trios: Record<string, Value[]>, patch = {}) => {
    const base = playerView({ mode: 'spicy', targetTrios: 2, ...patch });
    return { ...base, players: base.players.map((p) => ({ ...p, trios: trios[p.id] ?? [] })) };
  };

  it('dice por qué se ha ganado', () => {
    const winner: Winner = { playerIds: ['p0'], team: null, reason: 'connected' };
    expect(winnerText(winner, names)).toBe('¡Gana Ana con dos tríos conectados!');
  });

  it('sabe qué tríos te darían la partida', () => {
    expect(winningValues(withTrios({ p0: [2] }))).toEqual([5, 9]);
    // Si otro ya se llevó el de nueves, ese ya no puede salir.
    expect(winningValues(withTrios({ p0: [2], p1: [9] }))).toEqual([5]);
    expect(winningValues(withTrios({}))).toEqual([]);
  });

  it('por equipos cuentan también los tríos del compañero, no los de los rivales', () => {
    const base = teamsView({ mode: 'spicy', targetTrios: 2 });
    const view = {
      ...base,
      players: base.players.map((p) =>
        p.id === 'p2' ? { ...p, trios: [1 as const] } : p.id === 'p1' ? { ...p, trios: [3 as const] } : p,
      ),
    };
    expect(winningValues(view)).toEqual([6, 8]);
  });

  it('al empezar tu turno te recuerda qué te basta', () => {
    expect(statusText(withTrios({ p0: [2] }), names).hint).toBe('Te basta un trío de 5 o de 9.');
    expect(statusText(withTrios({ p0: [3, 12] }), names).hint).toBe('Te basta un trío de 4, de 5 o de 10.');
  });

  it('en sencillo no hay pista de conexiones', () => {
    expect(winningValues(playerView())).toEqual([]);
    expect(statusText(playerView(), names).hint).toContain('más baja o la más alta');
  });
});

describe('cuenta atrás de la salvaguarda', () => {
  const now = 1_000_000;

  it('solo aparece cuando queda poco', () => {
    expect(autoActionText(null, now)).toBeNull();
    expect(autoActionText(now + 90_000, now)).toBeNull();
    expect(autoActionText(now + 12_000, now)).toBe('El servidor continuará solo en 12 s');
  });

  it('no enseña tiempos negativos', () => {
    expect(autoActionText(now - 1_000, now)).toBeNull();
  });
});
