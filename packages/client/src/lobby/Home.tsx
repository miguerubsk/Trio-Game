import { useState, type FormEvent } from 'react';
import { NAME_MAX_LENGTH, ROOM_CODE_LENGTH } from '@trio/shared';
import { loadName, saveName } from '../net/storage';

interface Props {
  /** Código que venía en el enlace, si lo había. */
  initialCode: string;
  onCreate: (name: string) => Promise<string | null>;
  onJoin: (code: string, name: string) => Promise<string | null>;
}

export function Home({ initialCode, onCreate, onJoin }: Props) {
  const [name, setName] = useState(loadName);
  const [code, setCode] = useState(initialCode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = name.trim();
  const ready = trimmed.length > 0 && !busy;

  const run = async (action: (name: string) => Promise<string | null>) => {
    setBusy(true);
    setError(null);
    saveName(trimmed);
    setError(await action(trimmed));
    setBusy(false);
  };

  const create = (e: FormEvent) => {
    e.preventDefault();
    if (ready) void run(onCreate);
  };

  const join = (e: FormEvent) => {
    e.preventDefault();
    if (ready && code.length === ROOM_CODE_LENGTH) void run((who) => onJoin(code, who));
  };

  return (
    <main className="home">
      <h1 className="home__title">Trio</h1>
      <p className="home__claim">Juego de memoria para 3 a 6 personas. Cada uno desde su móvil.</p>

      <label className="field">
        <span>Tu nombre</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={NAME_MAX_LENGTH}
          autoComplete="nickname"
          placeholder="Ana"
        />
      </label>

      <form className="panel" onSubmit={create}>
        <h2>Crear una sala</h2>
        <button type="submit" className="btn btn--primary btn--big" disabled={!ready}>
          Crear sala
        </button>
      </form>

      <form className="panel" onSubmit={join}>
        <h2>Unirse con un código</h2>
        <label className="field">
          <span>Código de la sala</span>
          <input
            className="input--code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, ROOM_CODE_LENGTH))}
            maxLength={ROOM_CODE_LENGTH}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            placeholder="ABCD"
          />
        </label>
        <button
          type="submit"
          className="btn btn--big"
          disabled={!ready || code.length !== ROOM_CODE_LENGTH}
        >
          Unirse
        </button>
      </form>

      {error && <p className="error" role="alert">{error}</p>}

      <footer className="home__credits">
        Versión casera y sin ánimo de lucro del juego <strong>Trio</strong>, de Kaya Miyano (Devir).
        Sin sus ilustraciones ni su identidad gráfica.
      </footer>
    </main>
  );
}
