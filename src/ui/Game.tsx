import { useEffect, useMemo, useState } from 'react';
import {
  OBJECTS,
  cellKey,
  clueText,
  colLabel,
  describeFact,
  diagonals,
  evalRelational,
  explainNext,
  factViolations,
  isRelational,
  killerOf,
  objectAt,
  roomAt,
  roomIds,
  roomLabel,
  sidesWith,
  solve,
  unaryDomain,
  violations,
  type Cell,
  type Explanation,
  type Placement,
  type Puzzle,
} from '../engine';
import { backend, type Attempt, type Session, type SubmitResult } from '../api';
import { BoardView } from './BoardView';
import { Dossier, crimeRuleText } from './Dossier';
import { HintPanel } from './HintPanel';
import { useSettings } from './settings';
import { useGame } from './useGame';
import { formatTime, shareText } from './format';

interface Props {
  puzzle: Puzzle;
  session: Session;
  onExit: () => void;
  onSolved: () => void;
}

type Mode = 'place' | 'mark' | 'notes';

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

export function Game({ puzzle: p, session, onExit, onSolved }: Props) {
  const settings = useSettings();
  const game = useGame(p.id, session.alias);
  const { board } = game;
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [phase, setPhase] = useState<'loading' | 'dossier' | 'playing'>('loading');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(p.people[0].id);
  const [mode, setMode] = useState<Mode>('place');
  const [hint, setHint] = useState<Explanation | null>(null);
  const [hintFocus, setHintFocus] = useState<Cell[]>([]);
  // Pista interactiva: `hover` sigue al mouse/foco; `pinned` lo fija el botón 👁 (para touch).
  const [hover, setHover] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const preview = hover ?? pinned;
  const [inspected, setInspected] = useState<Cell | null>(null);
  const [accusing, setAccusing] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [showSolved, setShowSolved] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [copied, setCopied] = useState(false);

  const solution = useMemo(() => solve(p, { limit: 1 })[0], [p]);
  const strict = attempt?.strict ?? false;
  const liveErrors = settings.liveErrors && !strict;
  const bad = useMemo(
    () => (liveErrors ? new Set(violations(p, board.placements as Placement)) : new Set<string>()),
    [p, board.placements, liveErrors],
  );
  const badFacts = useMemo(
    () => (liveErrors ? new Set(factViolations(p, board.placements as Placement)) : new Set<number>()),
    [p, board.placements, liveErrors],
  );
  const placedCount = p.people.filter((x) => board.placements[x.id]).length;
  const complete = placedCount === p.people.length;
  const solved = attempt?.solved || result?.correct;
  const revealing = !!result?.correct && !showSolved && !dismissed;

  // ¿Ya había un intento? Si no, mostramos el expediente sin arrancar el reloj.
  useEffect(() => {
    backend
      .getAttempt(session, p.id)
      .then((a) => {
        setAttempt(a);
        setPhase(a ? 'playing' : 'dossier');
      })
      .catch((e: Error) => {
        setError(e.message);
        setPhase('dossier');
      });
  }, [p.id, session]);

  const open = async (strictMode: boolean) => {
    setBusy(true);
    try {
      setAttempt(await backend.startAttempt(session, p.id, strictMode));
      setPhase('playing');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (solved || phase !== 'playing') return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [solved, phase]);

  // Revelación: se ilumina la escena del crimen y después aparece el expediente cerrado.
  useEffect(() => {
    if (!result?.correct) return;
    const t = setTimeout(() => setShowSolved(true), reducedMotion() ? 300 : 1800);
    return () => clearTimeout(t);
  }, [result?.correct]);

  useEffect(() => {
    if (phase !== 'playing') return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, dialog')) return;
      const n = Number(e.key);
      if (n >= 1 && n <= p.people.length) setSelected(p.people[n - 1].id);
      else if (e.key === 'x') setMode((m) => (m === 'mark' ? 'place' : 'mark'));
      else if (e.key === 'n') setMode((m) => (m === 'notes' ? 'place' : 'notes'));
      else if ((e.metaKey || e.ctrlKey) && e.key === 'z') e.shiftKey ? game.redo() : game.undo();
      else if (e.key === 'Escape') {
        setSelected(null);
        setPinned(null);
      } else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const name = (id?: string) => p.people.find((x) => x.id === id)?.name ?? '';

  const onCell = (cell: Cell, alt: boolean) => {
    if (solved) return;
    setHintFocus([]);
    if (mode === 'mark' || alt) return game.toggleMark(cell);
    const occupant = Object.entries(board.placements).find(([, c]) => c && cellKey(c) === cellKey(cell))?.[0];
    if (mode === 'notes') {
      if (occupant) return setSelected(occupant);
      if (selected) game.toggleNote(cell, selected);
      return;
    }
    if (!selected || (occupant && occupant !== selected)) return setSelected(occupant ?? null);
    game.place(selected, cell);
    // Pasa al siguiente sin ubicar para agilizar.
    const next = p.people.find((x) => x.id !== selected && !board.placements[x.id]);
    if (!board.placements[selected] && next) setSelected(next.id);
  };

  const askHint = async () => {
    if (!attempt || solved || strict) return;
    const h = explainNext(p, solution, board.placements);
    setHint(h);
    setHintFocus(h.kind === 'wrong' ? [board.placements[h.personId]!] : h.kind === 'deduction' ? (h.steps[0]?.focus ?? []) : []);
    if (h.kind === 'none') return;
    if (h.kind !== 'wrong') setSelected(h.personId);
    try {
      await backend.useHint(session, attempt.attemptId);
      setAttempt({ ...attempt, hintsUsed: attempt.hintsUsed + 1 });
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const accuse = async (killer: string) => {
    if (!attempt) return;
    setAccusing(false);
    try {
      const r = await backend.submit(session, attempt.attemptId, board.placements as Placement, killer);
      setResult(r);
      setAttempt({ ...attempt, wrongSubmits: r.wrongSubmits, solved: r.correct, score: r.score, seconds: r.seconds });
      if (r.correct) {
        setHint(null);
        onSolved();
      }
    } catch (e) {
      setError((e as Error).message);
    }
  };

  // Pista interactiva: casillas compatibles con la pista de la persona (y con quienes ya ubicaste).
  const previewCells = useMemo(() => {
    if (!preview) return null;
    const x = p.people.find((o) => o.id === preview)!;
    let cells = unaryDomain(p, x);
    for (const rule of x.clue.rules.filter(isRelational)) {
      const other = board.placements[rule[1] as string];
      if (other) cells = cells.filter((c) => evalRelational(p, rule, c, other));
    }
    const open = unaryDomain(p, { ...x, clue: { rules: [] } }).length;
    return cells.length < open ? new Set(cells.map(cellKey)) : null;
  }, [preview, p, board.placements]);

  // Revelación: la escena del crimen queda iluminada.
  const crimeCells = useMemo(() => {
    if (!result?.correct) return null;
    const victim = p.people.find((x) => x.role === 'victim')!;
    const v = solution[victim.id];
    if ((p.crime ?? 'aloneWithVictim') === 'touchingVictim') {
      const k = killerOf(p, solution)!;
      return new Set([v, solution[k], ...diagonals(p, v)].map(cellKey));
    }
    const rid = roomAt(p, v);
    const cells: string[] = [];
    for (let r = 0; r < p.size; r++) for (let c = 0; c < p.size; c++) if (p.rooms[r][c] === rid) cells.push(`${r},${c}`);
    return new Set(cells);
  }, [result?.correct, p, solution]);

  const crossed = useMemo(() => {
    if (!settings.autoCross) return undefined;
    const set = new Set<string>();
    for (const c of Object.values(board.placements))
      if (c)
        for (let i = 0; i < p.size; i++) {
          set.add(`${c.r},${i}`);
          set.add(`${i},${c.c}`);
        }
    return set;
  }, [settings.autoCross, board.placements, p.size]);

  const seconds = attempt?.seconds ?? (attempt ? Math.max(0, Math.round((now - attempt.startedAt) / 1000)) : 0);

  if (phase === 'loading') return <p className="note">Abriendo el expediente…</p>;
  if (phase === 'dossier')
    return (
      <>
        {error && <p className="msg error">{error}</p>}
        <Dossier puzzle={p} busy={busy} onOpen={open} onBack={onExit} />
      </>
    );

  const inspectText = inspected
    ? [
        `${colLabel(inspected.c)}${inspected.r + 1}`,
        roomLabel(p, roomAt(p, inspected)),
        objectAt(p, inspected) !== '.' ? OBJECTS[objectAt(p, inspected) as keyof typeof OBJECTS].name : null,
        sidesWith(p, inspected, 'windows').length ? 'ventana' : null,
        sidesWith(p, inspected, 'doors').length ? 'puerta' : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : null;

  return (
    <section className={`game ${revealing ? 'revealing' : ''}`}>
      <header className="game-head">
        <button className="ghost back" onClick={onExit} aria-label="Volver a los casos">
          ←<span className="hide-sm"> Casos</span>
        </button>
        <div className="title">
          <span className="eyebrow">
            Expediente · {p.size}×{p.size}
            {strict && <span className="chip strict-chip">Estricto</span>}
          </span>
          <h2>{p.title}</h2>
        </div>
        <div className="timer" aria-label="Tiempo">
          {formatTime(seconds)}
        </div>
      </header>

      {error && <p className="msg error">{error}</p>}
      {result && !result.correct && (
        <p className="msg error" role="status">
          No es correcto. Revisá las pistas e intentá de nuevo (errores: {result.wrongSubmits}).
        </p>
      )}
      {hint && (
        <HintPanel
          key={JSON.stringify(board.placements)}
          puzzle={p}
          hint={hint}
          onFocus={setHintFocus}
          onApply={(id, cell) => {
            game.moveTo(id, cell);
            setHint(null);
            setHintFocus([]);
          }}
          onClose={() => {
            setHint(null);
            setHintFocus([]);
          }}
        />
      )}

      <div className="toolbar" role="toolbar" aria-label="Herramientas">
        <div className="segmented" role="group" aria-label="Modo">
          <button aria-pressed={mode === 'place'} onClick={() => setMode('place')}>
            <span aria-hidden>👤</span> <span className="tool-label">Colocar</span>
          </button>
          <button aria-pressed={mode === 'mark'} onClick={() => setMode('mark')}>
            <svg className="ico" aria-hidden>
              <use href="#mark-x" />
            </svg>{' '}
            <span className="tool-label">Marcar</span>
          </button>
          <button aria-pressed={mode === 'notes'} onClick={() => setMode('notes')} title="Notas (N)">
            <span aria-hidden>✎</span> <span className="tool-label">Notas</span>
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
        {!strict && (
          <button onClick={askHint} disabled={!!solved}>
            <span aria-hidden>💡</span> <span className="tool-label">Ayuda{attempt?.hintsUsed ? ` (${attempt.hintsUsed})` : ''}</span>
          </button>
        )}
        <button className="danger" onClick={() => setAccusing(true)} disabled={!complete || !!solved}>
          <span aria-hidden>🔎</span> <span className="tool-label">Acusar</span>
        </button>
      </div>

      <div className="game-body">
        <div className="board-col">
          <BoardView
            puzzle={p}
            board={board}
            bad={bad}
            highlight={new Set(hintFocus.map(cellKey))}
            focusCells={crimeCells ?? previewCells}
            crossed={crossed}
            selected={selected}
            onCell={onCell}
            onDrop={(id, cell) => !solved && game.moveTo(id, cell)}
            onInspect={setInspected}
            locked={!!solved}
          />
          <p className="inspect" aria-live="polite">
            {inspectText ?? (mode === 'notes' ? 'Modo notas: tocá casillas para anotar candidatos de la persona elegida.' : ' ')}
          </p>
          <ul className="legend" aria-label="Habitaciones">
            {roomIds(p).map((rid, i) => (
              <li key={rid}>
                <span className={`swatch room-${(i % 8) + 1}`} aria-hidden />
                {roomLabel(p, rid)}
              </li>
            ))}
          </ul>
        </div>

        <div className="people-col">
          {(p.facts?.length ?? 0) > 0 && (
            <section className="facts">
              <h3 className="eyebrow">Hechos del caso</h3>
              <ul>
                {p.facts!.map((f, i) => (
                  <li key={i} className={badFacts.has(i) ? 'bad' : ''}>
                    {f.text ?? describeFact(p, f.fact)}
                    {badFacts.has(i) && <span className="chip danger">No se cumple</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}
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
                  onMouseEnter={() => setHover(x.id)}
                  onMouseLeave={() => setHover((v) => (v === x.id ? null : v))}
                >
                  <button
                    onClick={() => setSelected(x.id)}
                    onFocus={() => setHover(x.id)}
                    onBlur={() => setHover((v) => (v === x.id ? null : v))}
                    aria-pressed={selected === x.id}
                  >
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
                  <div className="person-actions">
                    <button
                      className={`ghost peek ${pinned === x.id ? 'on' : ''}`}
                      onClick={() => setPinned((v) => (v === x.id ? null : x.id))}
                      aria-pressed={pinned === x.id}
                      aria-label={`Ver en el plano dónde puede estar ${x.name}`}
                      title="Ver en el plano"
                    >
                      👁
                    </button>
                    {at && !solved && (
                      <button className="ghost remove" onClick={() => game.remove(x.id)} aria-label={`Quitar a ${x.name} del plano`}>
                        ×
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>

          <details className="rules">
            <summary>Cómo se juega</summary>
            <ul>
              <li>Ubicá a cada persona en el plano: una sola por fila y una sola por columna.</li>
              <li>{crimeRuleText(p)}</li>
              <li>Nadie puede estar sobre muebles que ocupan la casilla (rayados). Sí sobre sillas, camas y alfombras.</li>
              <li>"Junto a" es una casilla vecina hacia arriba, abajo, izquierda o derecha. "En diagonal" es tocándose por la esquina. "Más al norte" es en una fila más arriba.</li>
              <li>Pasá el mouse por una pista (o tocá 👁) para ver dónde puede estar esa persona.</li>
              <li>Atajos: números para elegir persona, X marcar, N notas, flechas para moverte, Ctrl+Z deshace. Podés arrastrar las fichas.</li>
            </ul>
          </details>
        </div>
      </div>

      {accusing && <div className="overlay" onClick={() => setAccusing(false)} />}
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

      {result?.correct && dismissed && (
        <p className="msg solved-banner" role="status">
          ✓ Caso cerrado · {result.score} pts
          <button onClick={() => setDismissed(false)}>Ver resultado</button>
        </p>
      )}
      {result?.correct && showSolved && !dismissed && <div className="overlay" />}
      {result?.correct && showSolved && !dismissed && (
        <dialog open className="modal solved" aria-label="Caso resuelto">
          <span className="stamp">Caso cerrado</span>
          <h3>¡Lo resolviste!</h3>
          <p>{(p.epilogue ?? '{killer} fue quien lo hizo.').replace('{killer}', name(result.killer))}</p>
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
              <dt>Puntos{strict ? ' (+25%)' : ''}</dt>
              <dd>{result.score}</dd>
            </div>
          </dl>
          <div className="row">
            <button onClick={() => setDismissed(true)}>Ver el plano</button>
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
