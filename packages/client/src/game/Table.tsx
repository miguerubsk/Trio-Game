import { useEffect, useMemo } from 'react';
import type { Action, End, PlayerId, PlayerView, RoomView, Value } from '@trio/shared';
import { winnerText, type Names } from '../text';
import { Progress, TrioFan, valueClass } from '../ui/Card';
import { useGameSounds } from '../sound/useGameSounds';
import { Avatar, Logo } from '../ui/Icons';
import { RulesButton } from '../ui/Rules';
import { SoundToggle } from '../ui/SoundToggle';
import { useWide } from '../ui/useWide';
import { Center } from './Center';
import { LogSheet } from './LogSheet';
import { centerMark, handMark, useRevealOrder } from './marks';
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
  const wide = useWide();
  const orderOf = useRevealOrder(view);
  useGameSounds(view);
  // Por equipos los tríos cuentan por pareja: la meta se ve en el marcador.
  const target = view.teams ? undefined : view.targetTrios;

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
        <span className="brand">
          <Logo /> Sala <span className="code-chip">{room.code}</span>
        </span>
        <div className="table__actions">
          {wide && <RulesButton mode={view.mode} teams={view.teams} />}
          <SoundToggle />
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
            target={target}
            markAt={(index) => handMark(view, player.id, index)}
            orderAt={(index) => orderOf({ kind: 'hand', playerId: player.id, index })}
            onAsk={askTo(player.id)}
            onKick={kickHandler(player.id, player.name)}
            onSubstitute={substituteHandler(player.id)}
          />
        ))}
      </div>

      <Center
        slots={view.center}
        choosable={reveal?.centerSlots ?? []}
        markAt={(slot) => centerMark(view, slot)}
        orderAt={(slot) => orderOf({ kind: 'center', slot })}
        onReveal={(slot) => onAction({ type: 'REVEAL_CENTER', slot })}
      />

      {/*
        El turno y el registro: en escritorio forman el lateral; en el móvil el
        lateral no existe y siguen en el orden de siempre (styles.css).
      */}
      <aside className="table__side">
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

        <LogSheet log={view.log} names={names} pinned={wide} />
        {!wide && <RulesButton mode={view.mode} teams={view.teams} variant="row" />}
      </aside>

      <MyHand
        view={view}
        onAsk={askTo(view.me)}
        onChoose={
          view.legal.swap ? (handIndex) => onAction({ type: 'SWAP_CHOOSE', handIndex }) : null
        }
        received={received}
        orderAt={(index) => orderOf({ kind: 'hand', playerId: view.me, index })}
      />

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
  const winners = new Set(view.winner?.playerIds ?? []);
  const won = view.players.filter((p) => winners.has(p.id)).flatMap((p) => p.trios);
  const sevens = view.winner?.reason === 'sevens';

  return (
    <div className="finished" role="dialog" aria-modal="true" aria-label="Fin de la partida">
      {view.winner && <Confetti />}
      <div className={`finished__card${sevens ? ' is-sevens' : ''}`}>
        {won.length > 0 && (
          <div className="finished__fans">
            {won.map((value, i) => (
              <TrioFan key={`${value}-${i}`} value={value} />
            ))}
          </div>
        )}
        <h2 className="finished__title">
          {view.winner ? winnerText(view.winner, names) : 'Partida terminada.'}
        </h2>
        <ul className="finished__scores">
          {scoreboard(view).map((line) => (
            <li key={line.who} className={line.ids.some((id) => winners.has(id)) ? 'is-winner' : ''}>
              {line.ids.length === 1 && <Avatar name={line.who} />}
              <span className="finished__who">{line.who}</span>
              <Progress values={line.trios} target={view.targetTrios} />
              <span className="finished__count">
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

/** Una sola vez, al abrirse el cartel. Con «reducir movimiento» no sale. */
const CONFETTI: Value[] = [1, 5, 8, 7, 11, 2, 9, 4, 12, 6, 10, 3, 7, 5];

function Confetti() {
  return (
    <div className="confetti" aria-hidden="true">
      {CONFETTI.map((value, i) => (
        <i
          key={i}
          className={valueClass(value)}
          style={{
            left: `${6 + i * 6.5}%`,
            animationDelay: `${(i % 5) * 0.12 + Math.floor(i / 5) * 0.2}s`,
          }}
        />
      ))}
    </div>
  );
}

/** El recuento final: por equipos si los hay, y si no, jugador a jugador. */
function scoreboard(view: PlayerView): { who: string; ids: PlayerId[]; trios: Value[] }[] {
  if (!view.teams) {
    return view.players.map((p) => ({ who: p.name, ids: [p.id], trios: p.trios }));
  }
  return teamsOf(view).map(({ team, members }) => ({
    who: `Equipo ${team + 1}: ${members.map((m) => m.name).join(' y ')}`,
    ids: members.map((m) => m.id),
    trios: members.flatMap((m) => m.trios),
  }));
}
