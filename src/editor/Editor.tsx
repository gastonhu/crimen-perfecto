// Editor visual de casos (#editor y #editor/<borrador>). Se carga con React.lazy desde App.
import { useEffect, useState } from 'react';
import type { Author } from './backend';
import { go } from './common';
import { DraftEditor } from './DraftEditor';
import { DraftList } from './DraftList';
import { editorBackend as backend } from './localBackend';
import './editor.css';

function AuthorSignIn({ onDone }: { onDone: (a: Author) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onDone(await backend.signIn(email, password));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="auth card ed-auth" onSubmit={submit}>
      <span className="eyebrow">Editor de casos</span>
      <h2>Ingreso de autores</h2>
      <p className="note">Este ingreso es para quienes escriben casos. Es aparte del alias y PIN de los jugadores.</p>
      {backend.mode === 'local' && (
        <p className="msg hint-msg" role="note">
          <strong>Modo local:</strong> no hay servidor. Cualquier email y contraseña entran, y los borradores y casos
          publicados quedan solo en este navegador.
        </p>
      )}
      <label>
        Email
        <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </label>
      <label>
        Contraseña
        <input
          type="password"
          className="ed-password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button className="primary accent" disabled={busy}>
        {busy ? 'Entrando…' : 'Entrar'}
      </button>
      <button type="button" className="ghost" onClick={() => go('')}>
        ← Volver al juego
      </button>
    </form>
  );
}

export default function Editor({ route }: { route: string }) {
  const [author, setAuthor] = useState<Author | null | undefined>(undefined);
  useEffect(() => {
    backend
      .currentAuthor()
      .then(setAuthor)
      .catch(() => setAuthor(null));
  }, []);

  if (author === undefined) return <p className="note">Abriendo el editor…</p>;
  if (!author) return <AuthorSignIn onDone={setAuthor} />;

  const key = route.startsWith('editor/') ? decodeURIComponent(route.slice('editor/'.length)) : null;
  return (
    <section className="ed">
      <div className="ed-bar">
        <span className="eyebrow">
          ✎ Editor de casos{backend.mode === 'local' && <span className="chip ed-local">Modo local</span>}
        </span>
        <span className="ed-author">{author.email}</span>
        <button
          className="ghost"
          onClick={async () => {
            await backend.signOut();
            setAuthor(null);
          }}
        >
          Salir del modo autor
        </button>
        <button className="ghost" onClick={() => go('')}>
          ← Juego
        </button>
      </div>
      {key ? <DraftEditor key={key} draftKey={key} backend={backend} /> : <DraftList backend={backend} />}
    </section>
  );
}
