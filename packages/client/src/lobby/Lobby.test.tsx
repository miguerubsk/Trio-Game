// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RoomView } from '@trio/shared';
import { roomView, teamsRoom } from '../fixtures';
import { Home } from './Home';
import { Lobby } from './Lobby';

afterEach(cleanup);

const lobby = (patch: Partial<RoomView> = {}) => roomView({ status: 'lobby', ...patch });

function show(room: RoomView) {
  const handlers = {
    onStart: vi.fn(),
    onKick: vi.fn(),
    onConfigure: vi.fn(),
    onChooseTeam: vi.fn(),
    onAddBot: vi.fn(),
    onLeave: vi.fn(),
  };
  render(<Lobby room={room} {...handlers} />);
  return handlers;
}

describe('sala de espera', () => {
  it('enseña el código y a todo el mundo', () => {
    show(lobby());
    expect(screen.getByText('ABCD')).toBeTruthy();
    expect(screen.getByText('Jugadores (3)')).toBeTruthy();
    expect(screen.getByText('Bea')).toBeTruthy();
  });

  it('el anfitrión empieza la partida', () => {
    const { onStart } = show(lobby());
    fireEvent.click(screen.getByRole('button', { name: 'Empezar partida' }));
    expect(onStart).toHaveBeenCalled();
  });

  it('si faltan jugadores, el botón no deja y se explica', () => {
    show(lobby({ startBlocker: 'PLAYER_COUNT', members: roomView().members.slice(0, 1) }));
    const button = screen.getByRole('button', { name: 'Empezar partida' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.getByText(/entre 3 y 6/)).toBeTruthy();
  });

  it('quien no es anfitrión no ve el botón ni puede configurar', () => {
    show(lobby({ hostId: 'p1' }));
    expect(screen.queryByRole('button', { name: 'Empezar partida' })).toBeNull();
    expect(screen.getByText(/Esperando a que Bea/)).toBeTruthy();
    for (const select of screen.getAllByRole('combobox')) {
      expect((select as HTMLSelectElement).disabled).toBe(true);
    }
  });

  it('el anfitrión ajusta la salvaguarda de inactividad', () => {
    const { onConfigure } = show(lobby());
    const select = screen.getByRole('combobox', { name: /continúa solo/ });
    fireEvent.change(select, { target: { value: '180' } });
    expect(onConfigure).toHaveBeenCalledWith({ idleSeconds: 180 });
  });
});

describe('elegir modo y pareja', () => {
  const teamLobby = (patch = {}) => teamsRoom({ status: 'lobby', ...patch });

  it('el anfitrión cambia de modo y ve qué implica cada uno', () => {
    const { onConfigure } = show(lobby());
    expect(screen.getByText(/cada uno a lo suyo/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Por equipos' }));
    expect(onConfigure).toHaveBeenCalledWith({ mode: 'teams' });
  });

  it('quien no es anfitrión ve el modo pero no lo cambia', () => {
    show(lobby({ hostId: 'p1' }));
    expect((screen.getByRole('button', { name: 'Por equipos' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('en modo sencillo no hay que elegir pareja', () => {
    show(lobby());
    expect(document.querySelector('.picker')).toBeNull();
  });

  it('cada uno entra en el equipo que quiera, y sale', () => {
    const { onChooseTeam } = show(
      teamLobby({ members: teamsRoom().members.map((m) => ({ ...m, team: null })) }),
    );
    fireEvent.click(screen.getAllByRole('button', { name: 'Entrar' })[1] as HTMLElement);
    expect(onChooseTeam).toHaveBeenCalledWith(1);
    expect(screen.getByText(/Sin pareja elegida/)).toBeTruthy();
  });

  it('un equipo con dos no admite a nadie más', () => {
    show(teamLobby({ me: 'p1' }));
    const teams = document.querySelectorAll('.picker__team');
    expect(teams).toHaveLength(2);
    // Ana y Carlos ya son pareja: el equipo 1 está completo para Bea.
    expect(within(teams[0] as HTMLElement).getByRole('button', { name: 'Completo' })).toBeTruthy();
    expect(within(teams[1] as HTMLElement).getByRole('button', { name: 'Salir del equipo' })).toBeTruthy();
  });
});

describe('bots en la sala', () => {
  const withBot = () =>
    lobby({
      members: [
        ...roomView().members,
        { id: 'b1', name: 'Robotina', connected: true, bot: true, playedByBot: false, gone: false, team: null },
      ],
    });

  it('el anfitrión añade bots', () => {
    const { onAddBot } = show(lobby());
    fireEvent.click(screen.getByRole('button', { name: 'Añadir un bot' }));
    expect(onAddBot).toHaveBeenCalled();
  });

  it('quien no es anfitrión no puede añadirlos', () => {
    show(lobby({ hostId: 'p1' }));
    expect(screen.queryByRole('button', { name: 'Añadir un bot' })).toBeNull();
  });

  it('un bot se ve como tal y se quita sin preguntar', () => {
    const { onKick } = show(withBot());
    const row = screen.getByText('Robotina').closest('li') as HTMLElement;
    expect(within(row).getByText('bot')).toBeTruthy();
    fireEvent.click(within(row).getByRole('button', { name: 'Quitar' }));
    expect(onKick).toHaveBeenCalledWith('b1');
  });

  it('con la sala llena no se pueden añadir más', () => {
    const full = lobby({
      members: Array.from({ length: 6 }, (_, i) => ({
        id: `x${i}`,
        name: `J${i}`,
        connected: true,
        bot: i > 0,
        playedByBot: false,
        gone: false,
        team: null,
      })),
      hostId: 'x0',
      me: 'x0',
    });
    show(full);
    expect((screen.getByRole('button', { name: 'Añadir un bot' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('se elige la memoria de los bots y cuándo relevan a quien se cae', () => {
    const { onConfigure } = show(lobby());
    fireEvent.change(screen.getByRole('combobox', { name: /Memoria/ }), { target: { value: 'hard' } });
    expect(onConfigure).toHaveBeenCalledWith({ botLevel: 'hard' });

    fireEvent.change(screen.getByRole('combobox', { name: /se cae/ }), { target: { value: '0' } });
    expect(onConfigure).toHaveBeenCalledWith({ botTakeoverSeconds: 0 });
    expect(screen.getByText('nunca: se espera a que vuelva')).toBeTruthy();
  });
});

describe('portada', () => {
  const home = () => {
    const onCreate = vi.fn().mockResolvedValue(null);
    const onJoin = vi.fn().mockResolvedValue(null);
    render(<Home initialCode="" onCreate={onCreate} onJoin={onJoin} />);
    return { onCreate, onJoin };
  };

  it('no deja crear una sala sin nombre', () => {
    home();
    expect((screen.getByRole('button', { name: 'Crear sala' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('crea la sala con el nombre escrito', () => {
    const { onCreate } = home();
    fireEvent.change(screen.getByLabelText('Tu nombre'), { target: { value: '  Ana  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear sala' }));
    expect(onCreate).toHaveBeenCalledWith('Ana');
  });

  it('para unirse hacen falta las cuatro letras del código', () => {
    const { onJoin } = home();
    fireEvent.change(screen.getByLabelText('Tu nombre'), { target: { value: 'Ana' } });
    const code = screen.getByLabelText('Código de la sala');
    fireEvent.change(code, { target: { value: 'abc' } });
    expect((screen.getByRole('button', { name: 'Unirse' }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(code, { target: { value: 'abcd' } });
    expect((code as HTMLInputElement).value).toBe('ABCD');
    fireEvent.click(screen.getByRole('button', { name: 'Unirse' }));
    expect(onJoin).toHaveBeenCalledWith('ABCD', 'Ana');
  });
});
