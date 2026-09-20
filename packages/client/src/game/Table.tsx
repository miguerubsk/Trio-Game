import { useEffect, useMemo } from 'react';
import type { Action, End, PlayerId, PlayerView, RoomView, Value } from '@trio/shared';
import { winnerText, type Names } from '../text';
import { Trios } from '../ui/Card';
import { Center } from './Center';
import { LogSheet } from './LogSheet';
import { MyHand } from './MyHand';
import { PlayerRow } from './PlayerRow';
import { StatusBar } from './StatusBar';
import { TeamScore, teamsOf } from './TeamScore';
import { TeamSwap } from './TeamSwap';

interface Props {
  room: RoomView;
  view: PlayerView;
  onAction: (action: Action) => void;
  onKick: (playerId: PlayerId) => void;
  onSubstitute: (playerId: PlayerId) => void;
  onBackToLobby: () => void;
  onLeave: () => void;
  /** La carta que acaba de darte tu compañero, si acaba de haber intercambio. */
  received: Value | null;
}

export function Table({
  room,
  view,
  onAction,
  onKick,
  onSubstitute,
  onBackToLobby,
  onLeave,
  received,
}: Props) {
  const names: Names = useMemo(
    () => Object.fromEntries(view.players.map((p) => [p.id, p.name])),
    [view.players],
  );
  const isHost = room.hostId === view.me;
  const reveal = view.legal.reveal;
  const myTeam = view.players.find((p) => p.id === view.me)?.team ?? null;
  const myTurn = view.currentPlayerId === view.me && view.phase === 'awaitingReveal';

  // Un aviso discreto al llegar el turno: se va a jugar mirando el móvil de reojo.
  useEffect(() => {
    if (myTurn) navigator.vibrate?.(40);
  }, [myTurn]);

  // La mesa se lee desde tu asiento: el siguiente jugador va primero.
  const seat = view.players.findIndex((p) => p.id === view.me);
  const others = [...view.players.slice(seat + 1), ...view.players.slice(0, Math.max(seat, 0))];

  const memberOf = (id: PlayerId) => room.members.find((m) => m.id === id);
  const askTo = (targetId: PlayerId) =>
    reveal?.targets.includes(targetId)
      ? (end: End) => onAction({ type: 'REVEAL_PLAYER', targetId, end })
      : null;

  /** Meter un bot solo tiene sentido si falta alguien y no lo juega ya otro. */
  const substituteHandler = (id: PlayerId) => {
    const member = memberOf(id);
    if (!isHost || !member || member.bot || member.playedByBot) return null;
    if (member.connected && !member.gone) return null;
    return () => onSubstitute(id);
  };

  /** Solo se puede expulsar a quien se ha caído, y solo el anfitrión. */
  const kickHandler = (id: PlayerId, name: string) => {
    const member = memberOf(id);
    if (!isHost || !member || member.gone || member.connected) return null;
    return () => {
      if (window.confirm(`¿Expulsar a ${name}? Su mano se queda en la mesa y sus turnos se saltan.`)) {
        onKick(id);
      }
    };
  };

  return (
    <div className="table">
      <header className="table__head">
        <span className="code-chip">Sala {room.code}</span>
        <div className="table__actions">
          {isHost && view.phase !== 'finished' && (
            <button
              type="button"
              className="link"
              onClick={() => window.confirm('¿Terminar la partida y volver a la sala?') && onBackToLobby()}
            >
              Terminar partida
            </button>
          )}
          <button
            type="button"
            className="link"
            onClick={() => window.confirm('¿Salir de la sala?') && onLeave()}
          >
            Salir
          </button>
        </div>
      </header>

      <TeamScore view={view} />

      <div className="table__players">
        {others.map((player) => (
          <PlayerRow
            key={player.id}
            player={player}
            member={memberOf(player.id)}
            isCurrent={player.id === view.currentPlayerId}
            isPartner={myTeam !== null && player.team === myTeam}
            onAsk={askTo(player.id)}
            onKick={kickHandler(player.id, player.name)}
            onSubstitute={substituteHandler(player.id)}
          />
        ))}
      </div>

      <Center
        slots={view.center}
        choosable={reveal?.centerSlots ?? []}
        onReveal={(slot) => onAction({ type: 'REVEAL_CENTER', slot })}
      />

      {/* Al terminar manda el cartel del final: la barra sobraría debajo. */}
      {view.phase !== 'finished' && (
        <StatusBar
          view={view}
          names={names}
          autoActionAt={room.autoActionAt}
          onConfirm={() => onAction({ type: 'CONFIRM_RETURN' })}
        />
      )}

      {view.phase === 'teamSwap' && (
        <TeamSwap view={view} names={names} onPass={() => onAction({ type: 'SWAP_PASS' })} />
      )}

      <MyHand
        view={view}
        onAsk={askTo(view.me)}
        onChoose={
          view.legal.swap ? (handIndex) => onAction({ type: 'SWAP_CHOOSE', handIndex }) : null
        }
        received={received}
      />

      <LogSheet log={view.log} names={names} />

      {view.phase === 'finished' && (
        <Finished
          view={view}
          names={names}
          isHost={isHost}
          hostName={memberOf(room.hostId)?.name ?? 'el anfitrión'}
          onBackToLobby={onBackToLobby}
        />
      )}
    </div>
  );
}

interface FinishedProps {
  view: PlayerView;
  names: Names;
  isHost: boolean;
  hostName: string;
  onBackToLobby: () => void;
}

function Finished({ view, names, isHost, hostName, onBackToLobby }: FinishedProps) {
  return (
    <div className="finished" role="dialog" aria-modal="true" aria-label="Fin de la partida">
      <div className="finished__card">
        <h2 className="finished__title">
          {view.winner ? winnerText(view.winner, names) : 'Partida terminada.'}
        </h2>
        <ul className="finished__scores">
          {scoreboard(view).map((line) => (
            <li key={line.who}>
              <span className="finished__who">{line.who}</span>
              <Trios values={line.trios} />
              <span className="muted">
                {line.trios.length} {line.trios.length === 1 ? 'trío' : 'tríos'}
              </span>
            </li>
          ))}
        </ul>
        {isHost ? (
          <button type="button" className="btn btn--primary btn--big" onClick={onBackToLobby}>
            Volver a la sala
          </button>
        ) : (
          <p className="hint">Esperando a que {hostName} vuelva a la sala…</p>
        )}
      </div>
    </div>
  );
}

/** El recuento final: por equipos si los hay, y si no, jugador a jugador. */
function scoreboard(view: PlayerView): { who: string; trios: Value[] }[] {
  if (view.mode !== 'teams') {
    return view.players.map((p) => ({ who: p.name, trios: p.trios }));
  }
  return teamsOf(view).map(({ team, members }) => ({
    who: `Equipo ${team + 1}: ${members.map((m) => m.name).join(' y ')}`,
    trios: members.flatMap((m) => m.trios),
  }));
}
