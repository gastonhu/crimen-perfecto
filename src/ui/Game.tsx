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
  const [copied, setCopied] = useState(false);

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
        <button className="ghost back" onClick={onExit} aria-label="Volver a los casos">
          ←<span className="hide-sm"> Casos</span>
        </button>
        <div className="title">
          <span className="eyebrow">Expediente · {p.size}×{p.size}</span>
          <h2>{p.title}</h2>
        </div>
        <div className="timer" aria-label="Tiempo">
          {formatTime(seconds)}
        </div>
      </header>

      <p className="story">{p.story}</p>
      {error && <p className="msg error">{error}</p>}
      {hint && (
        <p className="msg hint-msg" role="status">
          💡 {hint.text}
        </p>
      )}
      {result && !result.correct && (
        <p className="msg error" role="status">
          No es correcto. Revisá las pistas e intentá de nuevo (errores: {result.wrongSubmits}).
        </p>
      )}

      <div className="toolbar" role="toolbar" aria-label="Herramientas">
        <div className="segmented" role="group" aria-label="Modo">
          <button aria-pressed={mode === 'place'} onClick={() => setMode('place')}>
            <span aria-hidden>👤</span> Colocar
          </button>
          <button aria-pressed={mode === 'mark'} onClick={() => setMode('mark')}>
            <svg className="ico" aria-hidden>
              <use href="#mark-x" />
            </svg>{' '}
            Marcar
          </button>
        </div>
        <button onClick={game.undo} disabled={!game.canUndo} title="Deshacer (Ctrl+Z)">
          <span aria-hidden>↶</span> <span className="tool-label">Deshacer</span>
        </button>
        <button className="desktop-only" onClick={game.redo} disabled={!game.canRedo} title="Rehacer (Ctrl+Shift+Z)">
          <span aria-hidden>↷</span> Rehacer
        </button>
        <button className="desktop-only" onClick={game.clear} disabled={!!solved}>
          Borrar todo
        </button>
        <button onClick={askHint} disabled={!!solved}>
          <span aria-hidden>💡</span> <span className="tool-label">Ayuda{attempt?.hintsUsed ? ` (${attempt.hintsUsed})` : ''}</span>
        </button>
        <button className="danger" onClick={() => setAccusing(true)} disabled={!complete || !!solved}>
          <span aria-hidden>🔎</span> <span className="tool-label">Acusar</span>
        </button>
      </div>

      <div className="game-body">
        <BoardView
          puzzle={p}
          board={board}
          bad={bad}
          highlight={new Set((hint?.cells ?? []).map(cellKey))}
          selected={selected}
          onCell={onCell}
        />

        <div className="people-col">
          <h3 className="eyebrow">
            Personas · {placedCount}/{p.people.length} en el plano
          </h3>
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
                      <span className="name">
                        <kbd>{i + 1}</kbd> {x.name}
                        {x.role === 'victim' && <span className="tag danger">Víctima</span>}
                      </span>
                      <span className="clue">{clueText(p, x)}</span>
                      <span className={`chip ${bad.has(x.id) ? 'danger' : at ? 'success' : ''}`}>
                        {bad.has(x.id) ? 'No cumple su pista' : at ? `En el plano · ${colLabel(at.c)}${at.r + 1}` : 'Sin ubicar'}
                      </span>
                    </span>
                  </button>
                  {at && !solved && (
                    <button className="ghost remove" onClick={() => game.remove(x.id)} aria-label={`Quitar a ${x.name} del plano`}>
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
              <li>Atajos: números para elegir persona, X para marcar, flechas para moverte por el plano, clic derecho o Shift+clic marca una casilla, Ctrl+Z deshace.</li>
            </ul>
          </details>
        </div>
      </div>

      {accusing && (
        <div className="overlay" onClick={() => setAccusing(false)} />
      )}
      {accusing && (
        <dialog open className="modal" aria-label="Acusar">
          <h3>¿Quién lo hizo?</h3>
          <div className="suspects">
            {p.people
              .filter((x) => x.role === 'suspect')
              .map((x) => (
                <button key={x.id} className="suspect" onClick={() => accuse(x.id)}>
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
        <div className="overlay" />
      )}
      {result?.correct && (
        <dialog open className="modal solved" aria-label="Caso resuelto">
          <span className="stamp">Caso cerrado</span>
          <h3>¡Lo resolviste!</h3>
          <p>{(p.epilogue ?? '{killer} fue quien lo hizo.').replace('{killer}', killerName(result.killer))}</p>
          <dl className="stats">
            <div>
              <dt>Tiempo</dt>
              <dd>{formatTime(result.seconds ?? 0)}</dd>
            </div>
            <div>
              <dt>Ayudas</dt>
              <dd>{attempt?.hintsUsed ?? 0}</dd>
            </div>
            <div>
              <dt>Errores</dt>
              <dd>{result.wrongSubmits}</dd>
            </div>
            <div className="score">
              <dt>Puntos</dt>
              <dd>{result.score}</dd>
            </div>
          </dl>
          <div className="row">
            <button
              onClick={() =>
                navigator.clipboard
                  ?.writeText(shareText(p, result.seconds ?? 0, attempt?.hintsUsed ?? 0, result.wrongSubmits))
                  .then(() => setCopied(true))
                  .catch(() => {})
              }
            >
              {copied ? '✓ Copiado' : '📋 Copiar resultado'}
            </button>
            <button className="primary accent" onClick={onExit}>
              Otro caso
            </button>
          </div>
        </dialog>
      )}
    </section>
  );
}
