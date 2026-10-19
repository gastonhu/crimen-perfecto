import { useCallback, useEffect, useRef, useState } from 'react';
import { backend, onSessionExpired, type GlobalRow, type PuzzleRow, type Session } from './api';
import type { Puzzle } from './engine';
import { puzzleById } from './puzzles';
import sprite from '../design/furniture-icons.svg?raw';
import { AuthDialog } from './ui/AuthDialog';
import { CaseSelect } from './ui/CaseSelect';
import { ConnectionStatus } from './ui/ConnectionStatus';
import { Game } from './ui/Game';
import { Leaderboard } from './ui/Leaderboard';
import { SettingsDialog } from './ui/SettingsDialog';
import { updateSettings } from './ui/settings';
import { Tutorial } from './ui/tutorial/Tutorial';

const SESSION_KEY = 'crimen-perfecto:session';

function loadSession(): Session | null {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null');
  } catch {
    return null;
  }
}

export function App() {
  const [session, setSession] = useState<Session | null>(loadSession);
  const [puzzle, setPuzzle] = useState<Puzzle | null>(() => puzzleById(location.hash.slice(1)) ?? null);
  const [solved, setSolved] = useState<Set<string>>(new Set());
  const [global, setGlobal] = useState<GlobalRow[]>([]);
  const [puzzleRows, setPuzzleRows] = useState<PuzzleRow[]>([]);
  const [lbOpen, setLbOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tutorial, setTutorial] = useState(false);
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
    history.replaceState(null, '', puzzle ? `#${puzzle.id}` : location.pathname);
  }, [puzzle]);

  useEffect(() => {
    const onHash = () => setPuzzle(puzzleById(location.hash.slice(1)) ?? null);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

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

  return (
    <div className={`app ${session && (puzzle || tutorial) ? 'in-game' : ''}`}>
      <div hidden dangerouslySetInnerHTML={{ __html: sprite }} />
      <header className="top">
        <h1>Crimen Perfecto</h1>
        <div className="me">
          <ConnectionStatus />
          {session && <span className="alias">🕵️ {session.alias}</span>}
          <button className="ghost icon" onClick={() => setSettingsOpen(true)} aria-label="Ajustes" title="Ajustes">
            ⚙
          </button>
          {session && (
            <button className="ghost" onClick={logout}>
              Salir
            </button>
          )}
        </div>
      </header>
      <div className="layout">
        <main>
          {!session ? (
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
          ) : puzzle ? (
            <Game key={puzzle.id} puzzle={puzzle} session={session} onExit={() => setPuzzle(null)} onSolved={refresh} />
          ) : (
            <CaseSelect solved={solved} onPick={setPuzzle} onTutorial={() => setTutorial(true)} />
          )}
        </main>
        <Leaderboard
          online={backend.online}
          me={session?.alias}
          global={global}
          puzzle={puzzle ? { title: puzzle.title, rows: puzzleRows } : undefined}
          open={lbOpen}
          onToggle={() => setLbOpen((o) => !o)}
        />
      </div>
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
