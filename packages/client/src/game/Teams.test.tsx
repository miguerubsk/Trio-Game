// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlayerView, RoomView, SwapView, Value } from '@trio/shared';
import { teamsRoom, teamsView } from '../fixtures';
import { Table } from './Table';

afterEach(cleanup);

function show(view: PlayerView, room: RoomView = teamsRoom(), received: Value | null = null) {
  const handlers = {
    onAction: vi.fn(),
    onKick: vi.fn(),
    onSubstitute: vi.fn(),
    onBackToLobby: vi.fn(),
    onLeave: vi.fn(),
  };
  const utils = render(<Table room={room} view={view} {...handlers} received={received} />);
  return { ...handlers, ...utils };
}

/** Intercambio abierto para las dos parejas; Ana (p0) aún no ha respondido. */
const swapPending = (patch: Partial<SwapView> = {}): SwapView => ({
  reason: 'start',
  teams: [
    { team: 0, done: false, responded: { p0: false, p2: false } },
    { team: 1, done: false, responded: { p1: true, p3: false } },
  ],
  myResponse: null,
  ...patch,
});

const teamOf = (label: RegExp) => {
  const card = screen.getByText(label, { selector: '.teams__team h3' }).closest('.teams__team');
  if (!card) throw new Error(`Sin marcador para ${label}`);
  return within(card as HTMLElement);
};

describe('mesa por equipos', () => {
  it('suma los tríos de los dos compañeros y señala tu equipo', () => {
    const view = teamsView({
      players: teamsView().players.map((p) =>
        p.id === 'p0' ? { ...p, trios: [4] } : p.id === 'p2' ? { ...p, trios: [9] } : p,
      ),
    });
    show(view);
    expect(teamOf(/Equipo 1/).getByText('Ana y Carlos')).toBeTruthy();
    expect(teamOf(/Equipo 1/).getByText('2 de 3')).toBeTruthy();
    expect(teamOf(/Equipo 2/).getByText('0 de 3')).toBeTruthy();
    expect(teamOf(/Equipo 1/).getByText('el tuyo')).toBeTruthy();
  });

  it('marca a tu compañero en la mesa y no al resto', () => {
    show(teamsView());
    const partner = screen.getByText('Carlos').closest('.player') as HTMLElement;
    expect(within(partner).getByText('tu compañero')).toBeTruthy();
    expect(screen.getAllByText('tu compañero')).toHaveLength(1);
  });

  it('en equipos no hay centro que voltear', () => {
    const { container } = show(teamsView());
    expect(container.querySelector('.center')).toBeNull();
  });
});

describe('intercambio con el compañero', () => {
  const swapping = (patch: Partial<PlayerView> = {}) =>
    teamsView({
      phase: 'teamSwap',
      swap: swapPending(),
      legal: { reveal: null, confirm: false, swap: { handSize: 3 } },
      ...patch,
    });

  it('explica a quién le das la carta y cómo se decide', () => {
    show(swapping());
    expect(screen.getByText(/Antes de empezar/)).toBeTruthy();
    expect(screen.getByText(/dársela a Carlos/)).toBeTruthy();
    expect(screen.getByText(/los dos elegís carta/)).toBeTruthy();
  });

  it('tocar una carta de tu mano la ofrece; el botón pasa', () => {
    const { onAction } = show(swapping());
    fireEvent.click(screen.getByLabelText(/Tu carta 2/));
    expect(onAction).toHaveBeenCalledWith({ type: 'SWAP_CHOOSE', handIndex: 1 });

    fireEvent.click(screen.getByRole('button', { name: 'Pasar' }));
    expect(onAction).toHaveBeenCalledWith({ type: 'SWAP_PASS' });
  });

  it('enseña quién ha respondido ya, sin decir qué ha elegido', () => {
    const { container } = show(swapping());
    const teams = container.querySelector('.swap__teams')?.textContent ?? '';
    expect(teams).toContain('Ana …');
    expect(teams).toContain('Bea ✓');
    // Junto a cada nombre solo hay ✓ o …: ni el índice ni el valor de su carta.
    expect(teams.replace(/Equipo \d+:/g, '')).not.toMatch(/\d/);
  });

  it('cuando ya has respondido, solo queda esperar', () => {
    show(
      swapping({
        swap: swapPending({ myResponse: 2 }),
        legal: { reveal: null, confirm: false, swap: null },
      }),
    );
    expect(screen.getByText('Ya has elegido carta.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Pasar' })).toBeNull();
  });

  it('si el intercambio no te toca, lo dice', () => {
    show(
      swapping({
        swap: swapPending({ reason: 'trio', teams: [{ team: 1, done: false, responded: { p1: false, p3: false } }] }),
        legal: { reveal: null, confirm: false, swap: null },
      }),
    );
    expect(screen.getByText(/Un equipo rival ha hecho trío/)).toBeTruthy();
    expect(screen.getByText('Tu equipo no participa en este intercambio.')).toBeTruthy();
  });

  it('avisa de la carta que te ha dado tu compañero y la marca', () => {
    const { container } = show(teamsView(), teamsRoom(), 5);
    expect(screen.getByText('Tu compañero te ha dado un 5.')).toBeTruthy();
    const fresh = container.querySelectorAll('.myhand .card.is-fresh');
    expect(fresh).toHaveLength(1);
    expect(fresh[0]?.textContent).toBe('5');
  });
});

describe('final por equipos', () => {
  it('el recuento va por parejas, no por jugador', () => {
    const view = teamsView({
      phase: 'finished',
      winner: { playerIds: ['p0', 'p2'], team: 0, reason: 'trios' },
      players: teamsView().players.map((p) =>
        p.id === 'p0' ? { ...p, trios: [4, 9] } : p.id === 'p2' ? { ...p, trios: [1] } : p,
      ),
      legal: { reveal: null, confirm: false, swap: null },
    });
    show(view);
    expect(screen.getByText('¡Gana el equipo de Ana y Carlos!')).toBeTruthy();
    const scores = screen.getByRole('dialog').querySelectorAll('.finished__scores li');
    expect(scores).toHaveLength(2);
    expect(scores[0]?.textContent).toContain('Equipo 1: Ana y Carlos');
    expect(scores[0]?.textContent).toContain('3 tríos');
  });
});
