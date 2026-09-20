import { useEffect, useSyncExternalStore } from 'react';
import { ROOM_CODE_LENGTH } from '@trio/shared';
import { Table } from './game/Table';
import { Home } from './lobby/Home';
import { Lobby } from './lobby/Lobby';
import {
  act,
  addBot,
  backToLobby,
  chooseTeam,
  configure,
  createRoom,
  dismissNotice,
  getState,
  joinRoom,
  kick,
  leaveRoom,
  startGame,
  subscribe,
  substitute,
} from './net/client';

/** El enlace que se comparte es `https://…/ABCD`. */
function codeFromUrl(): string {
  const match = new RegExp(`^/([A-Za-z]{${ROOM_CODE_LENGTH}})$`).exec(window.location.pathname);
  return match?.[1]?.toUpperCase() ?? '';
}

export function App() {
  const state = useSyncExternalStore(subscribe, getState);
  const { room, game, session, connection, notice } = state;
  const code = room?.code ?? null;

  // La barra de direcciones lleva el código: recargar o compartir funciona igual.
  useEffect(() => {
    const path = code ? `/${code}` : '/';
    if (window.location.pathname !== path) window.history.replaceState(null, '', path);
  }, [code]);

  return (
    <div className="app">
      {connection !== 'online' && (
        <p className="banner" role="status">
          {connection === 'offline' ? 'Sin conexión. Reintentando…' : 'Conectando…'}
        </p>
      )}

      {notice && (
        <div className="notice" role="alert">
          <p>{notice}</p>
          <button type="button" className="link" onClick={dismissNotice}>
            Cerrar
          </button>
        </div>
      )}

      {!room ? (
        session ? (
          <p className="loading">Volviendo a tu partida…</p>
        ) : (
          <Home initialCode={codeFromUrl()} onCreate={createRoom} onJoin={joinRoom} />
        )
      ) : room.status === 'lobby' ? (
        <Lobby
          room={room}
          onStart={() => void startGame()}
          onKick={(id) => void kick(id)}
          onConfigure={(patch) => void configure(patch)}
          onChooseTeam={(team) => void chooseTeam(team)}
          onAddBot={() => void addBot()}
          onLeave={() => void leaveRoom()}
        />
      ) : game ? (
        <Table
          room={room}
          view={game}
          onAction={(action) => void act(action)}
          onKick={(id) => void kick(id)}
          onSubstitute={(id) => void substitute(id)}
          onBackToLobby={() => void backToLobby()}
          onLeave={() => void leaveRoom()}
          received={state.received}
        />
      ) : (
        <p className="loading">Repartiendo…</p>
      )}
    </div>
  );
}
