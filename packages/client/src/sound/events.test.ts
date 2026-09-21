import { describe, expect, it } from 'vitest';
import type { PlayerView } from '@trio/shared';
import { playerView } from '../fixtures';
import { soundsFor } from './events';

const nombres = (before: PlayerView | null, after: PlayerView) =>
  soundsFor(before, after).map((c) => c.sound);

describe('qué suena en cada jugada', () => {
  it('la primera vista reparte', () => {
    expect(soundsFor(null, playerView())).toEqual([{ sound: 'deal', count: 3 }]);
  });

  it('una partida ya terminada no reparte nada', () => {
    expect(soundsFor(null, playerView({ phase: 'finished' }))).toEqual([]);
  });

  it('cada carta que se voltea suena, sea de quien sea', () => {
    const uno = playerView({ revealed: [{ value: 5, from: { kind: 'center', slot: 0 } }] });
    expect(nombres(playerView(), uno)).toEqual(['flip']);

    // Y también las que voltean los demás, que en la mesa se oyen igual.
    const deOtro = playerView({ currentPlayerId: 'p1', revealed: uno.revealed });
    expect(nombres(playerView({ currentPlayerId: 'p1' }), deOtro)).toEqual(['flip']);
  });

  it('el trío suena una vez, y al recogerlo suenan las cartas', () => {
    const antes = playerView({ revealed: [{ value: 7, from: { kind: 'center', slot: 0 } }] });
    const trio = playerView({
      phase: 'awaitingReturn',
      outcome: 'trio',
      revealed: [
        { value: 7, from: { kind: 'center', slot: 0 } },
        { value: 7, from: { kind: 'center', slot: 1 } },
        { value: 7, from: { kind: 'hand', playerId: 'p1', index: 0 } },
      ],
    });
    expect(nombres(antes, trio)).toEqual(['flip', 'trio']);
    expect(nombres(trio, trio)).toEqual([]); // no se repite mientras sigue puesto

    const recogido = playerView({ revealed: [] });
    expect(nombres(trio, recogido)).toEqual(['collect']);
  });

  it('al fallar, las cartas vuelven una a una', () => {
    const fallo = playerView({
      phase: 'awaitingReturn',
      outcome: 'mismatch',
      revealed: [
        { value: 9, from: { kind: 'center', slot: 0 } },
        { value: 3, from: { kind: 'center', slot: 1 } },
      ],
    });
    expect(nombres(playerView({ revealed: [fallo.revealed[0]!] }), fallo)).toEqual(['flip', 'miss']);
    expect(soundsFor(fallo, playerView({ revealed: [] }))).toEqual([
      { sound: 'back', count: 2 },
    ]);
  });

  it('avisa cuando te toca a ti, y no cuando le toca a otro', () => {
    const otro = playerView({ currentPlayerId: 'p1' });
    expect(nombres(otro, playerView())).toEqual(['turn']);
    expect(nombres(playerView(), otro)).toEqual([]);
    // Al terminar manda el final, no el turno.
    expect(nombres(otro, playerView({ phase: 'finished' }))).toEqual(['win']);
  });
});
