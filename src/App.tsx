import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { backend, onSessionExpired, type GlobalRow, type PuzzleRow, type Session } from './api';
import type { Puzzle } from './engine';
import { loadPuzzles, usePuzzles } from './puzzles';
import sprite from '../design/furniture-icons.svg?raw';
import { AuthDialog } from './ui/AuthDialog';
import { CaseSelect } from './ui/CaseSelect';
import { ConnectionStatus } from './ui/ConnectionStatus';
import { Game } from './ui/Game';
import { Icon } from './ui/Icon';
import { Leaderboard } from './ui/Leaderboard';
import { SettingsDialog } from './ui/SettingsDialog';
import { updateSettings } from './ui/settings';
import { Tutorial } from './ui/tutorial/Tutorial';

const SESSION_KEY = 'crimen-perfecto:session';

// Editor de casos (#editor, #editor/<borrador>): se carga aparte para no engordar el bundle del juego.
const Editor = lazy(() => import('./editor/Editor'));
const editorRoute = () => (/^#editor(\/|$)/.test(location.hash) ? location.hash.slice(1) : null);

function loadSession(): Session | null {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null');
  } catch {
    return null;
  }
}

export function App() {
  const [session, setSession] = useState<Session | null>(loadSession);
  // El caso abierto se guarda por id: la lista puede llegar después (con servidor viene de la base).
  const [puzzleId, setPuzzleId] = useState<string | null>(() => (editorRoute() ? null : location.hash.slice(1) || null));
  const puzzles = usePuzzles();
  const puzzle = puzzleId ? (puzzles.list.find((p) => p.id === puzzleId) ?? null) : null;
  const setPuzzle = (p: Puzzle | null) => setPuzzleId(p?.id ?? null);
  const [solved, setSolved] = useState<Set<string>>(new Set());
  const [global, setGlobal] = useState<GlobalRow[]>([]);
  const [puzzleRows, setPuzzleRows] = useState<PuzzleRow[]>([]);
  const [lbOpen, setLbOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tutorial, setTutorial] = useState(false);
  // Partida en curso (sin resolver): el marcador se guarda detrás de un botón para dejarle lugar al plano.
  const [playing, setPlaying] = useState(false);
  const [editor, setEditor] = useState<string | null>(editorRoute);
  // Aviso en la pantalla de ingreso cuando el servidor rechazó la sesión (venció o se cerró).
  const [expired, setExpired] = useState<string | null>(null);
  const sessionRef = useRef(session);
  useEffect(() => {
    sessionRef.current = session;
  });

  const refresh = useCallback(() => {
    backend.leaderboard().then(setGlobal).catch(() => {});
    if (puzzle) backend.puzzleLeaderboard(puzzle.id).then(setPuzzleRows).catch(() => {});
    if (session) backend.solvedPuzzles(session).then((ids) => setSolved(new Set(ids))).catch(() => {});
  }, [puzzle, session]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 30_000);
    return () => clearInterval(t);
  }, [refresh]);

  useEffect(() => {
    loadPuzzles(() => backend.listPuzzles());
  }, [editor]);

  useEffect(() => {
    if (editorRoute()) return;
    if (puzzleId && !puzzle && puzzles.loading) return; // todavía no llegó la lista: no borrar el #caso
    history.replaceState(null, '', puzzle ? `#${puzzle.id}` : location.pathname);
  }, [puzzle, puzzleId, puzzles.loading]);

  useEffect(() => {
    const onHash = () => {
      setEditor(editorRoute());
      setPuzzleId(editorRoute() ? null : location.hash.slice(1) || null);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    if (!lbOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setLbOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lbOpen]);

  const forget = () => {
    setSession(null);
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch {
      /* nada */
    }
  };

  useEffect(
    () =>
      onSessionExpired((token) => {
        const s = sessionRef.current;
        if (s?.token !== token) return; // aviso de una sesión que ya cerramos
        forget();
        setExpired(s.alias);
      }),
    [],
  );

  const login = (s: Session) => {
    setExpired(null);
    setSession(s);
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    } catch {
      /* sesión solo en memoria */
    }
  };
  const logout = () => {
    if (session) backend.logout(session).catch(() => {});
    forget();
    setPuzzle(null);
  };

  const focus = editor === null && !!session && (tutorial || (!!puzzle && playing));

  return (
    <div className={['app', session && (puzzle || tutorial) && 'in-game', focus && 'focus'].filter(Boolean).join(' ')}>
      <div hidden dangerouslySetInnerHTML={{ __html: sprite }} />
      <header className="top">
        <div className="brand">
          <Icon name="ui-lens" className="brand-ico" />
          <span className="brand-text">
            <h1>Crimen Perfecto</h1>
            <span className="tagline">Deducción, lápiz y lupa</span>
          </span>
        </div>
        <div className="me">
          <ConnectionStatus />
          {focus && (
            <button className="ghost" onClick={() => setLbOpen((o) => !o)} aria-expanded={lbOpen} aria-label="Marcador">
              <Icon name="ui-ledger" />
              <span className="hide-sm">Marcador</span>
            </button>
          )}
          {session && (
            <span className="alias" title={session.alias}>
              <span className="medal sm" aria-hidden>
                {session.alias[0]?.toUpperCase()}
              </span>
              <span className="alias-name">{session.alias}</span>
            </span>
          )}
          <button className="ghost icon" onClick={() => setSettingsOpen(true)} aria-label="Ajustes" title="Ajustes">
            <Icon name="ui-gear" />
          </button>
          {session && (
            <button className="ghost" onClick={logout}>
              Salir
            </button>
          )}
        </div>
      </header>
      <div className={`layout ${editor !== null ? 'editor-layout' : ''}`}>
        <main>
          {editor !== null ? (
            <Suspense fallback={<p className="note">Cargando el editor…</p>}>
              <Editor route={editor} />
            </Suspense>
          ) : !session ? (
            <AuthDialog
              onDone={login}
              alias={expired ?? undefined}
              notice={expired ? 'Tu sesión venció o se cerró. Volvé a ingresar con tu alias y PIN.' : undefined}
            />
          ) : tutorial ? (
            <Tutorial
              onDone={() => {
                updateSettings({ tutorialSeen: true });
                setTutorial(false);
              }}
            />
          ) : puzzleId && !puzzle && puzzles.loading ? (
            <p className="note">Abriendo el archivo de casos…</p>
          ) : puzzle ? (
            <Game
              key={puzzle.id}
              puzzle={puzzle}
              session={session}
              onExit={() => setPuzzle(null)}
              onSolved={refresh}
              onPlaying={setPlaying}
            />
          ) : (
            <CaseSelect solved={solved} onPick={setPuzzle} onTutorial={() => setTutorial(true)} />
          )}
        </main>
        {editor === null && (
          <Leaderboard
            online={backend.online}
            me={session?.alias}
            global={global}
            puzzle={puzzle ? { title: puzzle.title, rows: puzzleRows } : undefined}
            open={lbOpen}
            onToggle={() => setLbOpen((o) => !o)}
          />
        )}
      </div>
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
