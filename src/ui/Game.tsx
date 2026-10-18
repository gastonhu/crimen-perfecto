import { useEffect, useMemo, useState } from 'react';
import { cellKey, clueText, colLabel, nextHint, solve, violations, type Cell, type Placement, type Puzzle } from '../engine';
import { backend, type Attempt, type Session, type SubmitResult } from '../api';
import { BoardView } from './BoardView';
import { useGame } from './useGame';
import { formatTime, shareText } from './format';

interface Props {
  puzzle: Puzzle;
  session: Session;
  onExit: () => void;
  onSolved: () => void;
}

export function Game({ puzzle: p, session, onExit, onSolved }: Props) {
  const game = useGame(p.id, session.alias);
  const { board } = game;
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(p.people[0].id);
  const [mode, setMode] = useState<'place' | 'mark'>('place');
  const [hint, setHint] = useState<{ text: string; cells: Cell[] } | null>(null);
  const [accusing, setAccusing] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [now, setNow] = useState(Date.now());

  const solution = useMemo(() => solve(p, { limit: 1 })[0], [p]);
  const bad = useMemo(() => new Set(violations(p, board.placements as Placement)), [p, board.placements]);
  const placedCount = p.people.filter((x) => board.placements[x.id]).length;
  const complete = placedCount === p.people.length;
  const solved = attempt?.solved || result?.correct;

  useEffect(() => {
    backend
      .startAttempt(session, p.id)
      .then(setAttempt)
      .catch((e: Error) => setError(e.message));
  }, [p.id, session]);

  useEffect(() => {
    if (solved) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [solved]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, dialog')) return;
      const n = Number(e.key);
      if (n >= 1 && n <= p.people.length) setSelected(p.people[n - 1].id);
      else if (e.key === 'x') setMode((m) => (m === 'mark' ? 'place' : 'mark'));
      else if ((e.metaKey || e.ctrlKey) && e.key === 'z') e.shiftKey ? game.redo() : game.undo();
      else if (e.key === 'Escape') setSelected(null);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const onCell = (cell: Cell, alt: boolean) => {
    if (solved) return;
    setHint(null);
    if (mode === 'mark' || alt) return game.toggleMark(cell);
    const occupant = Object.entries(board.placements).find(([, c]) => c && cellKey(c) === cellKey(cell))?.[0];
    if (!selected || (occupant && occupant !== selected)) return setSelected(occupant ?? null);
    game.place(selected, cell);
    // Pasa al siguiente sin ubicar para agilizar.
    const next = p.people.find((x) => x.id !== selected && !board.placements[x.id]);
    if (!board.placements[selected] && next) setSelected(next.id);
  };

  const askHint = async () => {
    if (!attempt || solved) return;
    const h = nextHint(p, solution, board.placements);
    const name = (id: string) => p.people.find((x) => x.id === id)!.name;
    const where = (cells: Cell[]) => cells.map((c) => `${colLabel(c.c)}${c.r + 1}`).join(', ');
    if (h.kind === 'none') return setHint({ text: 'Ya ubicaste a todos: es hora de acusar.', cells: [] });
    await backend.useHint(session, attempt.attemptId).catch(() => {});
    setAttempt({ ...attempt, hintsUsed: attempt.hintsUsed + 1 });
    if (h.kind === 'wrong') {
      setSelected(h.personId);
      return setHint({ text: `Algo no cuadra con ${name(h.personId)}. Revisá su ubicación.`, cells: [board.placements[h.personId]!] });
    }
    setSelected(h.personId);
    setHint({
      text:
        h.kind === 'place'
          ? `${name(h.personId)} solo puede estar en ${where(h.cells)}.`
          : `${name(h.personId)} solo puede estar en una de estas casillas: ${where(h.cells)}.`,
      cells: h.cells,
    });
  };

  const accuse = async (killer: string) => {
    if (!attempt) return;
    setAccusing(false);
    try {
      const r = await backend.submit(session, attempt.attemptId, board.placements as Placement, killer);
      setResult(r);
      setAttempt({ ...attempt, wrongSubmits: r.wrongSubmits, solved: r.correct, score: r.score, seconds: r.seconds });
      if (r.correct) onSolved();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const seconds = attempt?.seconds ?? (attempt ? Math.max(0, Math.round((now - attempt.startedAt) / 1000)) : 0);
  const killerName = (id?: string) => p.people.find((x) => x.id === id)?.name ?? '';

  return (
    <section className="game">
      <header className="game-head">
        <button className="ghost" onClick={onExit}>
          ← Casos
        </button>
        <div className="title">
          <h2>{p.title}</h2>
          <span className="meta">
            {p.size}×{p.size} · dificultad {'●'.repeat(p.difficulty)}
            {'○'.repeat(5 - p.difficulty)}
          </span>
        </div>
        <div className="timer" aria-label="Tiempo">
          ⏱ {formatTime(seconds)}
        </div>
      </header>

      <p className="story">{p.story}</p>
      {error && <p className="error">{error}</p>}

      <div className="toolbar" role="toolbar">
        <div className="segmented">
          <button className={mode === 'place' ? 'on' : ''} onClick={() => setMode('place')}>
            👤 Colocar
          </button>
          <button className={mode === 'mark' ? 'on' : ''} onClick={() => setMode('mark')}>
            ✗ Marcar
          </button>
        </div>
        <button onClick={game.undo} disabled={!game.canUndo} title="Deshacer (Ctrl+Z)">
          ↶
        </button>
        <button onClick={game.redo} disabled={!game.canRedo} title="Rehacer (Ctrl+Shift+Z)">
          ↷
        </button>
        <button onClick={game.clear} disabled={!!solved}>
          Borrar todo
        </button>
        <button onClick={askHint} disabled={!!solved}>
          💡 Ayuda {attempt?.hintsUsed ? `(${attempt.hintsUsed})` : ''}
        </button>
        <button className="primary" onClick={() => setAccusing(true)} disabled={!complete || !!solved}>
          🔎 Acusar
        </button>
      </div>

      {hint && <p className="hint-msg">💡 {hint.text}</p>}
      {result && !result.correct && (
        <p className="error">No es correcto. Revisá las pistas e intentá de nuevo (errores: {result.wrongSubmits}).</p>
      )}

      <BoardView
        puzzle={p}
        board={board}
        bad={bad}
        highlight={new Set((hint?.cells ?? []).map(cellKey))}
        selected={selected}
        onCell={onCell}
      />

      <ol className="people">
        {p.people.map((x, i) => {
          const at = board.placements[x.id];
          return (
            <li
              key={x.id}
              className={['person', x.role, selected === x.id && 'selected', at && 'placed', bad.has(x.id) && 'bad'].filter(Boolean).join(' ')}
            >
              <button onClick={() => setSelected(x.id)} aria-pressed={selected === x.id}>
                <span className="avatar">{x.avatar}</span>
                <span className="who">
                  <strong>
                    <kbd>{i + 1}</kbd> {x.name}
                  </strong>
                  {x.role === 'victim' && <em> · víctima</em>}
                  <span className="clue">{clueText(p, x)}</span>
                </span>
                <span className="status">{at ? `${colLabel(at.c)}${at.r + 1}` : '—'}</span>
              </button>
              {at && !solved && (
                <button className="ghost remove" onClick={() => game.remove(x.id)} aria-label={`Quitar a ${x.name}`}>
                  ×
                </button>
              )}
            </li>
          );
        })}
      </ol>

      <details className="rules">
        <summary>Cómo se juega</summary>
        <ul>
          <li>Ubicá a cada persona en el plano: una sola por fila y una sola por columna.</li>
          <li>Nadie puede estar sobre muebles que ocupan la casilla (mesas, estantes, plantas, TV, racks, equipaje). Sí sobre sillas, camas y alfombras.</li>
          <li>"Junto a" significa en una casilla vecina hacia arriba, abajo, izquierda o derecha. "Más al norte" significa en una fila más arriba.</li>
          <li>El asesino es el único sospechoso que quedó a solas con la víctima en la misma habitación.</li>
          <li>Atajos: números para elegir persona, X para marcar, clic derecho o Shift+clic marca una casilla, Ctrl+Z deshace.</li>
        </ul>
      </details>

      {accusing && (
        <dialog open className="modal" aria-label="Acusar">
          <h3>¿Quién lo hizo?</h3>
          <div className="suspects">
            {p.people
              .filter((x) => x.role === 'suspect')
              .map((x) => (
                <button key={x.id} onClick={() => accuse(x.id)}>
                  <span className="avatar">{x.avatar}</span> {x.name}
                </button>
              ))}
          </div>
          <button className="ghost" onClick={() => setAccusing(false)}>
            Cancelar
          </button>
        </dialog>
      )}

      {result?.correct && (
        <dialog open className="modal solved" aria-label="Caso resuelto">
          <h3>¡Caso resuelto!</h3>
          <p>{(p.epilogue ?? '{killer} fue quien lo hizo.').replace('{killer}', killerName(result.killer))}</p>
          <p className="stats">
            ⏱ {formatTime(result.seconds ?? 0)} · 💡 {attempt?.hintsUsed ?? 0} · ✗ {result.wrongSubmits} · <strong>{result.score} pts</strong>
          </p>
          <div className="row">
            <button
              onClick={() =>
                navigator.clipboard?.writeText(shareText(p, result.seconds ?? 0, attempt?.hintsUsed ?? 0, result.wrongSubmits))
              }
            >
              📋 Copiar resultado
            </button>
            <button className="primary" onClick={onExit}>
              Otro caso
            </button>
          </div>
        </dialog>
      )}
    </section>
  );
}
