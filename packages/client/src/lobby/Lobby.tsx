import { useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  BOT_TAKEOVER_SECONDS,
  IDLE_SECONDS,
  MAX_PLAYERS,
  MAX_TEAMS,
  type BotLevel,
  type GameMode,
  type PlayerId,
  type RoomConfig,
  type RoomView,
} from '@trio/shared';
import { blockerText } from '../text';
import { play } from '../sound/player';
import { Avatar } from '../ui/Icons';
import { SoundToggle } from '../ui/SoundToggle';

interface Props {
  room: RoomView;
  onStart: () => void;
  onKick: (playerId: PlayerId) => void;
  onConfigure: (patch: Partial<RoomConfig>) => void;
  onChooseTeam: (team: number | null) => void;
  onAddBot: () => void;
  onLeave: () => void;
}

const IDLE_CHOICES = [30, 60, 90, 120, 180, 300].filter(
  (s) => s >= IDLE_SECONDS.min && s <= IDLE_SECONDS.max,
);

const BOT_LEVELS: { level: BotLevel; label: string }[] = [
  { level: 'easy', label: 'floja: olvida a menudo' },
  { level: 'normal', label: 'normal: como una persona' },
  { level: 'hard', label: 'de hierro: no olvida nada' },
];

const TAKEOVER_CHOICES = [BOT_TAKEOVER_SECONDS.never, 30, 60, 120, 300].filter(
  (s) => s === BOT_TAKEOVER_SECONDS.never || (s >= BOT_TAKEOVER_SECONDS.min && s <= BOT_TAKEOVER_SECONDS.max),
);

const takeoverLabel = (seconds: number): string => {
  if (seconds === BOT_TAKEOVER_SECONDS.never) return 'nunca: se espera a que vuelva';
  return seconds < 60 ? `${seconds} segundos` : `${seconds / 60} minuto${seconds > 60 ? 's' : ''}`;
};

/** Cómo se gana. Cualquiera de los dos se juega también por equipos. */
const MODES: { mode: GameMode; label: string; blurb: string }[] = [
  {
    mode: 'simple',
    label: 'Sencillo',
    blurb: 'Gana quien junte 3 tríos, o el trío de sietes.',
  },
  {
    mode: 'spicy',
    label: 'Picante',
    blurb:
      'Gana quien junte 2 tríos conectados, o el trío de sietes. Con qué conecta cada número lo dicen las esquinas de arriba de la carta.',
  },
];

const TABLES: { teams: boolean; label: string; blurb: string }[] = [
  {
    teams: false,
    label: 'Individual',
    blurb: 'De 3 a 6 jugadores, cada uno a lo suyo, con cartas en el centro.',
  },
  {
    teams: true,
    label: 'Por equipos',
    blurb: 'Por parejas, 4 o 6 jugadores. Sin cartas en el centro, los tríos de la pareja suman y hay intercambios entre compañeros.',
  },
];

export function Lobby({
  room,
  onStart,
  onKick,
  onConfigure,
  onChooseTeam,
  onAddBot,
  onLeave,
}: Props) {
  const isHost = room.hostId === room.me;
  const hostName = room.members.find((m) => m.id === room.hostId)?.name ?? 'el anfitrión';

  // Un aviso corto cuando llega alguien: se está mirando el móvil esperando.
  const seen = useRef(room.members.length);
  useEffect(() => {
    if (room.members.length > seen.current) play('join');
    seen.current = room.members.length;
  }, [room.members.length]);

  return (
    <main className="lobby">
      <div className="lobby__col">
        <ShareCode code={room.code} />

        <section className="panel">
          <div className="panel__head">
            <h2>Jugadores ({room.members.length})</h2>
            <SoundToggle />
          </div>
          <ul className="members">
            {room.members.map((m) => (
              <li key={m.id} className={m.connected ? '' : 'is-off'}>
                <Avatar name={m.name} bot={m.bot} active={m.id === room.me} />
                <span className="members__name">{m.name}</span>
                {m.id === room.me && <span className="tag">tú</span>}
                {m.id === room.hostId && <span className="tag">anfitrión</span>}
                {m.bot && <span className="tag tag--bot">bot</span>}
                {!m.connected && <span className="tag tag--warn">sin conexión</span>}
                {isHost && m.id !== room.me && (
                  <button
                    type="button"
                    className="link"
                    onClick={() => (m.bot || window.confirm(`¿Expulsar a ${m.name}?`)) && onKick(m.id)}
                  >
                    {m.bot ? 'Quitar' : 'Expulsar'}
                  </button>
                )}
              </li>
            ))}
          </ul>
          {isHost && (
            <button
              type="button"
              className="btn"
              onClick={onAddBot}
              disabled={room.members.length >= MAX_PLAYERS}
            >
              Añadir un bot
            </button>
          )}
        </section>
      </div>

      <div className="lobby__col">
        <section className="panel">
          <h2>Partida</h2>
          <div className="modes" role="group" aria-label="Modo de juego">
            {MODES.map(({ mode, label }) => (
              <button
                key={mode}
                type="button"
                className={`btn ${room.config.mode === mode ? 'btn--primary' : ''}`}
                aria-pressed={room.config.mode === mode}
                disabled={!isHost}
                onClick={() => onConfigure({ mode })}
              >
                {label}
              </button>
            ))}
        </div>
        <p className="muted">{MODES.find((m) => m.mode === room.config.mode)?.blurb}</p>

        <div className="modes" role="group" aria-label="Mesa">
          {TABLES.map(({ teams, label }) => (
            <button
              key={label}
              type="button"
              className={`btn ${room.config.teams === teams ? 'btn--primary' : ''}`}
              aria-pressed={room.config.teams === teams}
              disabled={!isHost}
              onClick={() => onConfigure({ teams })}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="muted">{TABLES.find((m) => m.teams === room.config.teams)?.blurb}</p>

        {room.config.teams && <TeamPicker room={room} onChooseTeam={onChooseTeam} />}

        <label className="field">
          <span>Memoria de los bots</span>
          <select
            value={room.config.botLevel}
            disabled={!isHost}
            onChange={(e) => onConfigure({ botLevel: e.target.value as BotLevel })}
          >
            {BOT_LEVELS.map(({ level, label }) => (
              <option key={level} value={level}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Si alguien se cae, un bot juega por él pasados</span>
          <select
            value={room.config.botTakeoverSeconds}
            disabled={!isHost}
            onChange={(e) => onConfigure({ botTakeoverSeconds: Number(e.target.value) })}
          >
            {TAKEOVER_CHOICES.map((seconds) => (
              <option key={seconds} value={seconds}>
                {takeoverLabel(seconds)}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Si el jugador de turno se va, el servidor continúa solo a los</span>
          <select
            value={room.config.idleSeconds}
            disabled={!isHost}
            onChange={(e) => onConfigure({ idleSeconds: Number(e.target.value) })}
          >
            {IDLE_CHOICES.map((seconds) => (
              <option key={seconds} value={seconds}>
                {seconds} segundos
              </option>
            ))}
          </select>
        </label>
      </section>

      {isHost ? (
        <>
          <button
            type="button"
            className="btn btn--primary btn--big"
            onClick={onStart}
            disabled={room.startBlocker !== null}
          >
            Empezar partida
          </button>
          {room.startBlocker && <p className="hint">{blockerText(room.startBlocker, room.config.teams)}</p>}
        </>
      ) : (
        <p className="hint">Esperando a que {hostName} empiece la partida.</p>
      )}

      <button type="button" className="link" onClick={() => window.confirm('¿Salir de la sala?') && onLeave()}>
        Salir de la sala
      </button>
      </div>
    </main>
  );
}

/**
 * Cada uno elige pareja en la sala. Quien no elija se reparte al azar al
 * empezar; el servidor sienta a los compañeros alternados.
 */
function TeamPicker({ room, onChooseTeam }: { room: RoomView; onChooseTeam: Props['onChooseTeam'] }) {
  const teams = Math.min(MAX_TEAMS, Math.max(2, Math.floor(room.members.length / 2)));
  const free = room.members.filter((m) => m.team === null);

  return (
    <div className="picker">
      <div className="picker__teams">
        {Array.from({ length: teams }, (_, team) => {
          const members = room.members.filter((m) => m.team === team);
          const mine = members.some((m) => m.id === room.me);
          return (
            <article key={team} className={`picker__team ${mine ? 'is-mine' : ''}`}>
              <h3>Equipo {team + 1}</h3>
              <p className="muted">{members.map((m) => m.name).join(' y ') || 'Libre'}</p>
              {mine ? (
                <button type="button" className="link" onClick={() => onChooseTeam(null)}>
                  Salir del equipo
                </button>
              ) : (
                <button
                  type="button"
                  className="btn"
                  disabled={members.length >= 2}
                  onClick={() => onChooseTeam(team)}
                >
                  {members.length >= 2 ? 'Completo' : 'Entrar'}
                </button>
              )}
            </article>
          );
        })}
      </div>
      {free.length > 0 && (
        <p className="muted">
          Sin pareja elegida: {free.map((m) => m.name).join(', ')}. Al empezar se reparten al azar.
        </p>
      )}
    </div>
  );
}

function ShareCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}/${code}`;

  const share = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Trio', text: `Entra en la sala ${code}`, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Compartir cancelado o sin permiso para el portapapeles: queda el código a la vista.
    }
  };

  return (
    <section className="share">
      <p className="share__label">Código de la sala</p>
      <p className="share__code">
        {/* El código se lee entero; las fichas son solo para verlo. */}
        <span className="visually-hidden">{code}</span>
        {[...code].map((letter, i) => (
          <span className="tile" key={i} style={{ '--i': i } as CSSProperties} aria-hidden="true">
            {letter}
          </span>
        ))}
      </p>
      <button type="button" className="btn" onClick={() => void share()}>
        {copied ? '¡Enlace copiado!' : 'Compartir enlace'}
      </button>
    </section>
  );
}
