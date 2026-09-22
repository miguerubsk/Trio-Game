// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LogEntry, PlayerView, RoomView } from '@trio/shared';
import { hand, playerView, roomView } from '../fixtures';
import { Table } from './Table';

afterEach(cleanup);

function show(view: PlayerView = playerView(), room: RoomView = roomView()) {
  const handlers = {
    onAction: vi.fn(),
    onKick: vi.fn(),
    onSubstitute: vi.fn(),
    onBackToLobby: vi.fn(),
    onLeave: vi.fn(),
  };
  const utils = render(<Table room={room} view={view} {...handlers} received={null} />);
  return { ...handlers, ...utils };
}

const rowOf = (name: string) => {
  const row = screen.getByText(name).closest('.player');
  if (!row) throw new Error(`Sin fila para ${name}`);
  return within(row as HTMLElement);
};

describe('mesa', () => {
  it('enseña a los demás jugadores, el centro y tu mano', () => {
    show();
    expect(screen.getByText('Bea')).toBeTruthy();
    expect(screen.getByText('Carlos')).toBeTruthy();
    expect(screen.queryByText('Ana')).toBeNull(); // tú apareces como «Tu mano»
    expect(screen.getByLabelText('Hueco 1, carta boca abajo')).toBeTruthy();
    expect(screen.getByLabelText('Hueco 3, vacío')).toBeTruthy();
    expect(screen.getByText('Tu mano')).toBeTruthy();
  });

  it('no pinta el valor de ninguna carta que no esté boca arriba', () => {
    const { container } = show(
      playerView({
        center: [{ state: 'down' }, { state: 'up', value: 9 }],
        players: [
          { id: 'p0', name: 'Ana', team: null, hand: hand([null]), trios: [] },
          { id: 'p1', name: 'Bea', team: null, hand: hand([null, 3]), trios: [] },
        ],
        myHand: [{ value: 2, faceUp: false }],
      }),
    );
    const values = [...container.querySelectorAll('.card__value')]
      .map((node) => node.textContent)
      .filter((text) => text !== '');
    // El 9 del centro, el 3 de Bea (boca arriba) y tu propia carta. Nada más.
    expect(values.sort()).toEqual(['2', '3', '9']);
  });

  it('voltear un hueco del centro manda la acción con su número', () => {
    const { onAction } = show();
    fireEvent.click(screen.getByLabelText('Hueco 2, carta boca abajo'));
    expect(onAction).toHaveBeenCalledWith({ type: 'REVEAL_CENTER', slot: 1 });
  });

  it('se puede pedir la más baja o la más alta de cada jugador, y también las tuyas', () => {
    const { onAction } = show();
    fireEvent.click(rowOf('Bea').getByRole('button', { name: /más baja/ }));
    expect(onAction).toHaveBeenCalledWith({ type: 'REVEAL_PLAYER', targetId: 'p1', end: 'lowest' });

    const mine = within(screen.getByLabelText('Tu mano'));
    fireEvent.click(mine.getByRole('button', { name: /más alta/ }));
    expect(onAction).toHaveBeenCalledWith({ type: 'REVEAL_PLAYER', targetId: 'p0', end: 'highest' });
  });

  it('sin turno no se puede tocar nada de la mesa', () => {
    const { container } = show(
      playerView({ currentPlayerId: 'p1', legal: { reveal: null, confirm: false, swap: null } }),
    );
    // Los botones siguen ahí para que la mesa no se mueva, pero apagados.
    const asks = screen.getAllByRole('button', { name: /más baja|más alta/ }) as HTMLButtonElement[];
    expect(asks.length).toBeGreaterThan(0);
    expect(asks.every((b) => b.disabled)).toBe(true);
    expect(container.querySelectorAll('.card.is-choosable')).toHaveLength(0);
    expect(screen.getByText('Turno de Bea')).toBeTruthy();
  });

  it('«continuar» solo lo ve quien tiene que continuar', () => {
    const settled = playerView({
      phase: 'awaitingReturn',
      outcome: 'mismatch',
      currentPlayerId: 'p1',
      legal: { reveal: null, confirm: false, swap: null },
    });
    show(settled);
    expect(screen.queryByRole('button', { name: 'Continuar' })).toBeNull();
    expect(screen.getByText(/Bea decide cuándo continuar/)).toBeTruthy();
    cleanup();

    const mine = playerView({
      phase: 'awaitingReturn',
      outcome: 'mismatch',
      legal: { reveal: null, confirm: true, swap: null },
    });
    const { onAction } = show(mine);
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(onAction).toHaveBeenCalledWith({ type: 'CONFIRM_RETURN' });
  });

  it('al cerrar un trío brillan sus tres cartas, estén donde estén, y la barra las enseña', () => {
    const { container } = show(
      playerView({
        phase: 'awaitingReturn',
        outcome: 'trio',
        center: [{ state: 'up', value: 4 }, { state: 'up', value: 4 }, { state: 'empty' }],
        players: [
          { id: 'p0', name: 'Ana', team: null, hand: hand([null, null, null]), trios: [] },
          { id: 'p1', name: 'Bea', team: null, hand: hand([4, null, null]), trios: [] },
          { id: 'p2', name: 'Carlos', team: null, hand: hand([null, null, null]), trios: [] },
        ],
        revealed: [
          { value: 4, from: { kind: 'center', slot: 0 } },
          { value: 4, from: { kind: 'center', slot: 1 } },
          { value: 4, from: { kind: 'hand', playerId: 'p1', index: 0 } },
        ],
        legal: { reveal: null, confirm: true, swap: null },
      }),
    );
    expect(screen.getByLabelText('Hueco 1, carta 4, a la vista de todos, forma trío, conecta con 3 y 11')).toBeTruthy();
    expect(screen.getByLabelText('Hueco 2, carta 4, a la vista de todos, forma trío, conecta con 3 y 11')).toBeTruthy();
    expect(rowOf('Bea').getByLabelText('Carta 1 de Bea, carta 4, a la vista de todos, forma trío, conecta con 3 y 11')).toBeTruthy();
    expect(container.querySelectorAll('.status .trail .card.is-trio')).toHaveLength(3);
    expect(screen.getByText('¡Trío de 4!')).toBeTruthy();
  });

  it('de un fallo solo se señala la carta que no casó', () => {
    const { container } = show(
      playerView({
        phase: 'awaitingReturn',
        outcome: 'mismatch',
        center: [{ state: 'up', value: 9 }, { state: 'down' }, { state: 'empty' }],
        players: [
          { id: 'p0', name: 'Ana', team: null, hand: hand([null, null, null]), trios: [] },
          { id: 'p1', name: 'Bea', team: null, hand: hand([3, null, null]), trios: [] },
          { id: 'p2', name: 'Carlos', team: null, hand: hand([null, null, null]), trios: [] },
        ],
        revealed: [
          { value: 9, from: { kind: 'center', slot: 0 } },
          { value: 3, from: { kind: 'hand', playerId: 'p1', index: 0 } },
        ],
        legal: { reveal: null, confirm: true, swap: null },
      }),
    );
    expect(screen.getByLabelText('Hueco 1, carta 9, a la vista de todos, conecta con 2')).toBeTruthy();
    expect(rowOf('Bea').getByLabelText('Carta 1 de Bea, carta 3, a la vista de todos, no coincide, conecta con 4 y 10')).toBeTruthy();
    expect(container.querySelectorAll('.card.is-trio')).toHaveLength(0);
  });

  it('cuando una mano encoge, las cartas que quedan no arrastran el valor de la que se fue', () => {
    const conCuatro = playerView({
      players: [
        { id: 'p0', name: 'Ana', team: null, hand: hand([null, null, null]), trios: [] },
        { id: 'p1', name: 'Bea', team: null, hand: hand([null, 4, null]), trios: [] },
        { id: 'p2', name: 'Carlos', team: null, hand: hand([null, null, null]), trios: [] },
      ],
    });
    // El motor recoge el trío: la carta sale de su mano y las de detrás corren.
    const recogido = playerView({
      players: [
        { id: 'p0', name: 'Ana', team: null, hand: hand([null, null, null]), trios: [] },
        { id: 'p1', name: 'Bea', team: null, hand: hand([null, null]), trios: [4] },
        { id: 'p2', name: 'Carlos', team: null, hand: hand([null, null, null]), trios: [] },
      ],
    });

    const handlers = {
      onAction: vi.fn(),
      onKick: vi.fn(),
      onSubstitute: vi.fn(),
      onBackToLobby: vi.fn(),
      onLeave: vi.fn(),
    };
    const room = roomView();
    const { container, rerender } = render(
      <Table room={room} view={conCuatro} {...handlers} received={null} />,
    );
    rerender(<Table room={room} view={recogido} {...handlers} received={null} />);

    const valores = [...container.querySelectorAll('.card__value')]
      .map((node) => node.textContent)
      .filter(Boolean);
    expect(valores).not.toContain('4');
  });

  it('los tríos de cada uno se ven contra los que hacen falta para ganar', () => {
    show(
      playerView({
        players: [
          { id: 'p0', name: 'Ana', team: null, hand: hand([null, null, null]), trios: [] },
          { id: 'p1', name: 'Bea', team: null, hand: hand([null, null, null]), trios: [3] },
          { id: 'p2', name: 'Carlos', team: null, hand: hand([null, null, null]), trios: [] },
        ],
      }),
    );
    expect(rowOf('Bea').getByRole('img', { name: 'Tríos: 3 (1 de 3)' })).toBeTruthy();
    expect(rowOf('Carlos').getByRole('img', { name: 'Sin tríos (0 de 3)' })).toBeTruthy();
  });

  it('en pantalla ancha el registro va abierto en el lateral, y en el móvil plegado', () => {
    const { container } = show();
    expect(container.querySelector('details.log')).toBeTruthy();
    cleanup();

    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: true,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
    try {
      const wide = show();
      expect(wide.container.querySelector('details.log')).toBeNull();
      expect(screen.getByRole('heading', { name: 'Registro de jugadas' })).toBeTruthy();
      // El turno y el registro van juntos en el lateral.
      expect(wide.container.querySelector('.table__side .status')).toBeTruthy();
    } finally {
      window.matchMedia = original;
    }
  });

  it('avisa de la cuenta atrás del servidor cuando queda poco', () => {
    const settled = playerView({ phase: 'awaitingReturn', outcome: 'mismatch', currentPlayerId: 'p1' });
    show(settled, roomView({ autoActionAt: Date.now() + 10_000 }));
    expect(screen.getByText(/El servidor continuará solo/)).toBeTruthy();
  });

  it('el registro no enseña el valor de lo que ya volvió boca abajo', () => {
    const log: LogEntry[] = [
      { type: 'reveal', by: 'p1', from: { kind: 'center', slot: 0 } },
      { type: 'mismatch', by: 'p1' },
      { type: 'return', by: 'p1' },
    ];
    show(playerView({ log }));
    expect(screen.getByText('Bea volteó el hueco 1.')).toBeTruthy();
    expect(screen.getByText('No coinciden.')).toBeTruthy();
  });

  it('al terminar se ve el ganador y el anfitrión vuelve a la sala', () => {
    const { onBackToLobby } = show(
      playerView({
        phase: 'finished',
        winner: { playerIds: ['p1'], team: null, reason: 'sevens' },
        legal: { reveal: null, confirm: false, swap: null },
      }),
    );
    expect(screen.getByText('¡Gana Bea con el trío de sietes!')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Volver a la sala' }));
    expect(onBackToLobby).toHaveBeenCalled();
  });

  it('quien no es anfitrión espera a que vuelva a la sala', () => {
    show(
      playerView({ phase: 'finished', winner: { playerIds: ['p1'], team: null, reason: 'trios' } }),
      roomView({ hostId: 'p1' }),
    );
    expect(screen.getByText(/Esperando a que Bea/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Volver a la sala' })).toBeNull();
  });

  it('se ve quién es un bot y a quién le está jugando uno', () => {
    const room = roomView({
      members: roomView().members.map((m) =>
        m.id === 'p1'
          ? { ...m, bot: true }
          : m.id === 'p2'
            ? { ...m, connected: false, playedByBot: true }
            : m,
      ),
    });
    show(playerView(), room);
    expect(rowOf('Bea').getByText('bot')).toBeTruthy();
    expect(rowOf('Carlos').getByText('juega un bot')).toBeTruthy();
    // «Sin conexión» sobra si ya hay un bot jugando por él.
    expect(rowOf('Carlos').queryByText('sin conexión')).toBeNull();
  });

  it('el anfitrión mete un bot por quien se ha caído, y solo por ese', () => {
    const dropped = roomView({
      members: roomView().members.map((m) =>
        m.id === 'p1' ? { ...m, connected: false } : m.id === 'p2' ? { ...m, bot: true } : m,
      ),
    });
    const { onSubstitute } = show(playerView(), dropped);
    expect(screen.getAllByRole('button', { name: 'Que juegue un bot' })).toHaveLength(1);
    fireEvent.click(rowOf('Bea').getByRole('button', { name: 'Que juegue un bot' }));
    expect(onSubstitute).toHaveBeenCalledWith('p1');
  });

  it('quien no es anfitrión no mete bots', () => {
    const dropped = roomView({
      hostId: 'p1',
      members: roomView().members.map((m) => (m.id === 'p1' ? { ...m, connected: false } : m)),
    });
    show(playerView(), dropped);
    expect(screen.queryByRole('button', { name: 'Que juegue un bot' })).toBeNull();
  });

  it('solo el anfitrión puede expulsar, y solo a quien se ha caído', () => {
    const connected = roomView();
    show(playerView(), connected);
    expect(screen.queryByRole('button', { name: 'Expulsar' })).toBeNull();
    cleanup();

    const dropped = roomView({
      members: roomView().members.map((m) => (m.id === 'p1' ? { ...m, connected: false } : m)),
    });
    show(playerView(), dropped);
    expect(rowOf('Bea').getByRole('button', { name: 'Expulsar' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Expulsar' })).toHaveLength(1);
  });
});

describe('las esquinas de las cartas', () => {
  const corners = (card: HTMLElement) =>
    [...card.querySelectorAll('.card__corner')].map((c) => ({
      side: c.classList.contains('card__corner--left') ? 'izquierda' : 'derecha',
      value: c.textContent,
      colour: [...c.classList].find((k) => /^v\d+$/.test(k)),
    }));

  const table = (patch: Partial<PlayerView> = {}) =>
    playerView({
      center: [
        { state: 'up', value: 2 },
        { state: 'up', value: 6 },
        { state: 'up', value: 7 },
        { state: 'down' },
      ],
      ...patch,
    });

  it('cada carta boca arriba lleva sus conexiones, una en cada esquina de arriba y en su color', () => {
    show(table());
    expect(corners(screen.getByLabelText(/^Hueco 1, carta 2/))).toEqual([
      { side: 'izquierda', value: '5', colour: 'v5' },
      { side: 'derecha', value: '9', colour: 'v9' },
    ]);
  });

  it('con una sola conexión, va a la izquierda', () => {
    show(table());
    expect(corners(screen.getByLabelText(/^Hueco 2, carta 6/))).toEqual([
      { side: 'izquierda', value: '1', colour: 'v1' },
    ]);
  });

  it('el 7 no conecta con nada y no lleva ninguna', () => {
    show(table());
    expect(corners(screen.getByLabelText(/^Hueco 3, carta 7/))).toEqual([]);
  });

  it('se anuncian también para quien no ve la carta', () => {
    show(table());
    expect(screen.getByLabelText(/^Hueco 1, carta 2, .*conecta con 5 y 9/)).toBeTruthy();
  });

  it('una carta boca abajo no lleva esquinas: delatarían el número', () => {
    show(table());
    expect(corners(screen.getByLabelText(/^Hueco 4, carta boca abajo/))).toEqual([]);
  });

  it('se ven en los dos modos, como en la baraja de verdad', () => {
    show(table({ mode: 'spicy', targetTrios: 2 }));
    expect(corners(screen.getByLabelText(/^Hueco 1, carta 2/))).toHaveLength(2);
  });
});
