// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CONNECTIONS, DEAL_TABLE, VALUES } from '@trio/shared';
import { playerView, roomView, teamsRoom } from '../fixtures';
import { Table } from '../game/Table';
import { Home } from '../lobby/Home';
import { Lobby } from '../lobby/Lobby';
import { CONNECTED_PAIRS, RulesButton } from './Rules';

afterEach(cleanup);

const open = (name: string | RegExp = 'Reglas del juego') => {
  fireEvent.click(screen.getByRole('button', { name }));
  return within(screen.getByRole('dialog', { name: 'Cómo se juega' }));
};

describe('reglas', () => {
  it('cerradas no ocupan la página; se abren y se cierran', () => {
    render(<RulesButton />);
    expect(screen.queryByRole('dialog')).toBeNull();
    const rules = open();
    fireEvent.click(rules.getByRole('button', { name: 'Cerrar' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('Escape, o lo que cierre el navegador, también las cierra', () => {
    render(<RulesButton />);
    open();
    fireEvent(screen.getByRole('dialog'), new Event('close'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('el reparto es el de la tabla del motor', () => {
    render(<RulesButton />);
    const rows = open()
      .getAllByRole('row')
      .slice(1)
      .map((row) => [...row.querySelectorAll('th, td')].map((cell) => cell.textContent));
    expect(rows).toEqual(
      Object.entries(DEAL_TABLE.solo).map(([n, spec]) => [n, `${spec.handSize}`, `${spec.centerSize}`]),
    );
  });

  it('las conexiones salen de la tabla del motor, cada una una vez', () => {
    expect(CONNECTED_PAIRS).toHaveLength(8);
    for (const a of VALUES) {
      for (const b of CONNECTIONS[a]) {
        const pair = a < b ? [a, b] : [b, a];
        expect(CONNECTED_PAIRS).toContainEqual(pair);
      }
    }
    render(<RulesButton />);
    const rules = open();
    expect(rules.getByLabelText('2 y 9')).toBeTruthy();
    expect(rules.queryByLabelText(/(^7 y|y 7$)/)).toBeNull();
  });

  it('cuentan los dos modos, el trío de sietes y la variante por equipos', () => {
    render(<RulesButton />);
    const rules = open();
    for (const title of ['Modo sencillo', 'Modo picante', 'En los dos', 'Por equipos']) {
      expect(rules.getByRole('heading', { name: title })).toBeTruthy();
    }
    expect(rules.getByText('3 tríos')).toBeTruthy();
    expect(rules.getByText('2 tríos conectados')).toBeTruthy();
    expect(rules.getByText(/9 a cada uno si sois 4 y 6 a cada uno si sois 6/)).toBeTruthy();
  });
});

describe('dónde se leen', () => {
  it('en la portada, antes de entrar en ninguna sala', () => {
    render(<Home initialCode="" onCreate={vi.fn()} onJoin={vi.fn()} />);
    const rules = open('¿Cómo se juega?');
    // Sin sala, no hay nada que decir de a qué se juega.
    expect(rules.queryByText(/En esta sala/)).toBeNull();
  });

  it('en la sala, diciendo a qué se va a jugar', () => {
    const room = teamsRoom();
    render(
      <Lobby
        room={{ ...room, config: { ...room.config, mode: 'spicy' } }}
        onStart={vi.fn()}
        onKick={vi.fn()}
        onConfigure={vi.fn()}
        onChooseTeam={vi.fn()}
        onAddBot={vi.fn()}
        onLeave={vi.fn()}
      />,
    );
    expect(open().getByText('modo picante, por equipos')).toBeTruthy();
  });

  it('en plena partida', () => {
    render(
      <Table
        room={roomView()}
        view={playerView()}
        onAction={vi.fn()}
        onKick={vi.fn()}
        onSubstitute={vi.fn()}
        onBackToLobby={vi.fn()}
        onLeave={vi.fn()}
        received={null}
      />,
    );
    expect(open().getByText('modo sencillo')).toBeTruthy();
  });
});
