import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  logicHash,
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
import { backend, isRetryable, withRetry, type Attempt, type Session, type SubmitResult } from '../api';
import { BoardView } from './BoardView';
import { clueRefs } from './clueRefs';
import { Dossier, crimeRuleText } from './Dossier';
import { HintPanel } from './HintPanel';
import { Icon, Monogram } from './Icon';
import { initials } from './initials';
import { themeInfo } from '../puzzles';
import { useSettings } from './settings';
import { sanitizeBoard, useGame, type Board, type SaveState } from './useGame';
import { formatTime, shareText } from './format';

interface Props {
  puzzle: Puzzle;
  session: Session;
  onExit: () => void;
  onSolved: () => void;
  /** Avisa si hay una partida en curso (abierta y sin resolver), para que la app despeje la pantalla. */
  onPlaying?: (playing: boolean) => void;
}

type Mode = 'place' | 'mark' | 'notes';

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

const SAVE_LABEL: Partial<Record<SaveState, string>> = {
  saving: 'Guardando…',
  saved: '✓ Guardado',
  offline: 'Sin conexión · guardado en este dispositivo',
  error: 'No se pudo guardar en el servidor',
};

export function Game({ puzzle: p, session, onExit, onSolved, onPlaying }: Props) {
  const settings = useSettings();
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [result, setResult] = useState<SubmitResult | null>(null);
  // El progreso se sube al servidor mientras haya un intento abierto y sin resolver.
  const remote =
    attempt && !attempt.solved && !result?.correct
      ? { save: (b: Board) => backend.saveProgress(session, attempt.attemptId, b) }
      : null;
  const game = useGame(p.id, session.alias, remote);
  const { board, adoptRemote } = game;
  const [phase, setPhase] = useState<'loading' | 'dossier' | 'playing'>('loading');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(p.people[0].id);
  const [mode, setMode] = useState<Mode>('place');
  const [hint, setHint] = useState<Explanation | null>(null);
  const [hintFocus, setHintFocus] = useState<Cell[]>([]);
  // Pista interactiva: `hover` sigue al mouse/foco; `pinned` lo fija el botón del ojo (para touch).
  const [hover, setHover] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const preview = hover ?? pinned;
  const [inspected, setInspected] = useState<Cell | null>(null);
  const [accusing, setAccusing] = useState(false);
  const [sending, setSending] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  // Hash de la lógica del caso que trae este bundle y si el servidor tiene publicado otro (el caso cambió).
  const [contentHash, setContentHash] = useState<string | undefined>(undefined);
  const [stale, setStale] = useState(false);
  const [showSolved, setShowSolved] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [copied, setCopied] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const boardRef = useRef<HTMLDivElement>(null);

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
  // Si el tablero cambia, la ayuda abierta ya no corresponde: se cierra.
  const boardKey = JSON.stringify(board.placements);
  const [hintBoard, setHintBoard] = useState(boardKey);
  if (hintBoard !== boardKey) {
    setHintBoard(boardKey);
    setHint(null);
    setHintFocus([]);
  }
  const placedCount = p.people.filter((x) => board.placements[x.id]).length;
  const complete = placedCount === p.people.length;
  const solved = attempt?.solved || result?.correct;
  const revealing = !!result?.correct && !showSolved && !dismissed;

  const playing = phase === 'playing' && !solved;
  useEffect(() => {
    onPlaying?.(playing);
  }, [playing, onPlaying]);
  useEffect(() => () => onPlaying?.(false), [onPlaying]);

  // Si el servidor tiene un tablero más nuevo que este dispositivo (se jugó en otro), se usa ese.
  const adoptFrom = useCallback(
    (a: Attempt | null) => {
      const b = a?.board ? sanitizeBoard(a.board, p) : null;
      if (b && a?.boardUpdatedAt) adoptRemote({ board: b, updatedAt: a.boardUpdatedAt });
    },
    [p, adoptRemote],
  );

  // ¿Ya había un intento? Si no, mostramos el expediente sin arrancar el reloj.
  useEffect(() => {
    backend
      .getAttempt(session, p.id)
      .then((a) => {
        setAttempt(a);
        adoptFrom(a);
        setPhase(a ? 'playing' : 'dossier');
      })
      .catch((e: Error) => {
        setError(e.message);
        setPhase('dossier');
      });
  }, [p.id, session, adoptFrom]);

  // ¿El caso publicado es el mismo que trae esta versión del juego? Si no, el servidor rechazaría la acusación.
  useEffect(() => {
    let alive = true;
    const local = logicHash(p);
    local.then((h) => alive && setContentHash(h));
    Promise.all([local, backend.puzzleMeta(p.id)])
      .then(([h, meta]) => alive && setStale(!!meta?.contentHash && meta.contentHash !== h))
      .catch(() => {
        /* sin conexión: no bloqueamos; el servidor igual controla el hash al acusar */
      });
    return () => {
      alive = false;
    };
  }, [p]);

  const open = async (strictMode: boolean) => {
    setBusy(true);
    try {
      const a = await backend.startAttempt(session, p.id, strictMode);
      setAttempt(a);
      adoptFrom(a);
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
      if (e.key === 'Escape' && accusing) return setAccusing(false);
      if (e.key === 'Escape' && menuOpen) return setMenuOpen(false);
      if ((e.target as HTMLElement).closest('input, textarea, dialog')) return;
      const n = Number(e.key);
      if (n >= 1 && n <= p.people.length) setSelected(p.people[n - 1].id);
      else if (e.key === 'x') setMode((m) => (m === 'mark' ? 'place' : 'mark'));
      else if (e.key === 'n') setMode((m) => (m === 'notes' ? 'place' : 'notes'));
      else if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        if (e.shiftKey) game.redo();
        else game.undo();
      }
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
  const short = useMemo(() => initials(p.people), [p.people]);

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
    // Pasa al siguiente sin ubicar (en el orden de la lista, desde quien se acaba de ubicar) para agilizar.
    if (!board.placements[selected]) {
      const from = p.people.findIndex((x) => x.id === selected);
      const rest = [...p.people.slice(from + 1), ...p.people.slice(0, from)];
      const next = rest.find((x) => !board.placements[x.id]);
      if (next) setSelected(next.id);
    }
  };

  // Elegir a la persona anterior o siguiente de la lista sin ir a buscarla (en mobile la lista queda abajo).
  const cycle = (step: 1 | -1) => {
    const i = p.people.findIndex((x) => x.id === selected);
    setSelected(p.people[(i + step + p.people.length) % p.people.length].id);
  };

  const askHint = async () => {
    if (!attempt || solved || strict) return;
    const h = explainNext(p, solution, board.placements);
    setHint(h);
    setHintFocus(h.kind === 'wrong' ? [board.placements[h.personId]!] : h.kind === 'deduction' ? (h.steps[0]?.focus ?? []) : []);
    if (h.kind === 'none') return;
    if (h.kind !== 'wrong') setSelected(h.personId);
    // Si el error ya está marcado en rojo en el plano, la ayuda no agrega nada: no se cobra.
    if (h.kind === 'wrong' && bad.has(h.personId)) return;
    try {
      await backend.useHint(session, attempt.attemptId);
      setAttempt({ ...attempt, hintsUsed: attempt.hintsUsed + 1 });
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const accuse = async (killer: string) => {
    if (!attempt || stale || sending) return;
    setAccusing(false);
    setSending(true);
    setError(null);
    try {
      // Si se corta la conexión, se reintenta con espera creciente; los rechazos del servidor no se reintentan.
      const r = await withRetry(
        () => backend.submit(session, attempt.attemptId, board.placements as Placement, killer, contentHash),
        { attempts: 4, onRetry: (n) => setInfo(`Sin conexión con el servidor: reintentando el envío (${n})…`) },
      );
      setResult(r);
      setAttempt({ ...attempt, wrongSubmits: r.wrongSubmits, solved: r.correct, score: r.score, seconds: r.seconds });
      if (r.correct) {
        setHint(null);
        onSolved();
      }
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.startsWith('Este caso cambió')) setStale(true);
      else setError(isRetryable(e) ? `No se pudo enviar la acusación. ${msg}` : msg);
    } finally {
      setSending(false);
      setInfo(null);
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
  // …y lo que esa pista nombra (habitación, mueble, ventana, otra persona), para que se entienda el porqué.
  const previewRefs = useMemo(() => {
    if (!preview || result?.correct) return null;
    return clueRefs(p, p.people.find((o) => o.id === preview)!, board.placements);
  }, [preview, p, board.placements, result?.correct]);

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

  const staleMsg = stale && (
    <p className="msg error" role="alert">
      Este caso cambió desde que se cargó la página: recargala para jugar la versión actual. Mientras tanto no se puede
      acusar.{' '}
      <button className="ghost" onClick={() => location.reload()}>
        Recargar
      </button>
    </p>
  );

  if (phase === 'loading') return <p className="note">Abriendo el expediente…</p>;
  if (phase === 'dossier')
    return (
      <>
        {staleMsg}
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

  const victim = p.people.find((x) => x.role === 'victim')!;
  const crimeText = crimeCells
    ? (p.crime ?? 'aloneWithVictim') === 'touchingVictim'
      ? `Escena del crimen: ${name(result?.killer)}, en diagonal a ${victim.name}`
      : `Escena del crimen: ${roomLabel(p, roomAt(p, solution[victim.id]))}, ${name(result?.killer)} a solas con ${victim.name}`
    : null;
  const current = selected ? p.people.find((x) => x.id === selected) : null;
  const previewPerson = preview && !crimeCells ? p.people.find((x) => x.id === preview) : null;
  const previewText = previewPerson
    ? `${previewPerson.name} · ${clueText(p, previewPerson)} → ${previewCells ? `${previewCells.size} ${previewCells.size === 1 ? 'casilla posible' : 'casillas posibles'}` : 'su pista depende de dónde estén otras personas'}`
    : null;

  return (
    <section className={`game ${revealing ? 'revealing' : ''}`}>
      <header className="game-head">
        <button className="ghost back" onClick={onExit} aria-label="Volver a los casos">
          <Icon name="ui-back" />
          <span className="hide-sm">Casos</span>
        </button>
        <div className="title">
          <span className="eyebrow">
            Expediente<span className="hide-sm"> · {themeInfo(p.theme).name}</span> · {p.size}×{p.size}
            {strict && <span className="chip strict-chip">Estricto</span>}
            {!solved && SAVE_LABEL[game.saveState] && (
              <span className={`chip save-chip ${game.saveState === 'saved' ? 'success' : game.saveState === 'saving' ? '' : 'danger'}`} role="status">
                {SAVE_LABEL[game.saveState]}
              </span>
            )}
          </span>
          <h2>{p.title}</h2>
        </div>
        <div className="timer" aria-label="Tiempo">
          <Icon name="ui-watch" />
          {formatTime(seconds)}
        </div>
      </header>

      {staleMsg}
      {error && <p className="msg error">{error}</p>}

      <div className="toolbar" role="toolbar" aria-label="Herramientas">
        <div className="segmented" role="group" aria-label="Modo">
          <button aria-pressed={mode === 'place'} onClick={() => setMode('place')} title="Colocar personas">
            <Icon name="tool-place" /> <span className="tool-label">Colocar</span>
          </button>
          <button aria-pressed={mode === 'mark'} onClick={() => setMode('mark')} title="Marcar casillas descartadas (X)">
            <svg className="ico" aria-hidden>
              <use href="#mark-x" />
            </svg>{' '}
            <span className="tool-label">Marcar</span>
          </button>
          <button aria-pressed={mode === 'notes'} onClick={() => setMode('notes')} title="Anotar candidatos (N)">
            <Icon name="tool-notes" /> <span className="tool-label">Notas</span>
          </button>
        </div>
        <button onClick={game.undo} disabled={!game.canUndo} title="Deshacer (Ctrl+Z)">
          <Icon name="tool-undo" /> <span className="tool-label">Deshacer</span>
        </button>
        {!strict && (
          <button onClick={askHint} disabled={!!solved} title="Te explica el próximo paso de la deducción (resta puntos)">
            <Icon name="tool-help" /> <span className="tool-label">Ayuda{attempt?.hintsUsed ? ` (${attempt.hintsUsed})` : ''}</span>
          </button>
        )}
        <div className="more desktop-only">
          <button className="ghost icon" onClick={() => setMenuOpen((o) => !o)} aria-expanded={menuOpen} aria-label="Más herramientas" title="Más herramientas">
            <Icon name="tool-more" />
          </button>
          {menuOpen && (
            <>
              <div className="menu-backdrop" onClick={() => setMenuOpen(false)} />
              <div className="menu" role="menu">
                <button
                  role="menuitem"
                  onClick={() => {
                    game.redo();
                    setMenuOpen(false);
                  }}
                  disabled={!game.canRedo}
                >
                  <Icon name="tool-redo" /> Rehacer <kbd>Ctrl+Shift+Z</kbd>
                </button>
                <button
                  role="menuitem"
                  onClick={() => {
                    game.clear();
                    setMenuOpen(false);
                  }}
                  disabled={!!solved}
                >
                  <Icon name="tool-clear" /> Borrar todo
                </button>
              </div>
            </>
          )}
        </div>
        <button
          className={`accuse ${complete ? 'danger' : ''}`}
          onClick={() => setAccusing(true)}
          disabled={!complete || !!solved || stale || sending}
          title={complete ? 'Elegir al culpable' : 'Ubicá a todas las personas para poder acusar'}
        >
          <Icon name="tool-accuse" className="ico accuse-ico" />{' '}
          <span className="tool-label">{sending ? 'Enviando…' : 'Acusar'}</span>
          {!complete && !solved && (
            <span className="count">
              {placedCount}/{p.people.length}
            </span>
          )}
        </button>
      </div>

      <div className="game-body">
        <div className="board-col" ref={boardRef}>
          {!solved && (
            <p className={`now ${mode}`} aria-live="polite">
              {mode === 'mark' ? (
                <span>
                  <strong>Marcar:</strong> tocá casillas para descartarlas con una X.
                </span>
              ) : current ? (
                <>
                  <button className="ghost icon" onClick={() => cycle(-1)} aria-label="Persona anterior">
                    <Icon name="ui-prev" />
                  </button>
                  <Monogram person={current} text={short.get(current.id) ?? ''} />
                  <span className="now-text">
                    {mode === 'notes' ? 'Notas de' : board.placements[current.id] ? 'Moviendo a' : 'Colocando a'}{' '}
                    <strong>{current.name}</strong> <span className="clue">· {clueText(p, current)}</span>
                  </span>
                  <button className="ghost icon" onClick={() => cycle(1)} aria-label="Persona siguiente">
                    <Icon name="ui-next" />
                  </button>
                </>
              ) : (
                <span>Elegí a una persona de la lista para ubicarla en el plano.</span>
              )}
            </p>
          )}
          <figure className="plate">
            <BoardView
              puzzle={p}
              board={board}
              bad={bad}
              highlight={new Set(hintFocus.map(cellKey))}
              focusCells={crimeCells ?? previewCells}
              refCells={previewRefs?.cells}
              crossed={crossed}
              selected={selected}
              onCell={onCell}
              onDrop={(id, cell) => !solved && game.moveTo(id, cell)}
              onInspect={setInspected}
              locked={!!solved}
            />
            <figcaption>
              <span>Lámina · {p.title}</span>
              <Icon name="ui-compass" className="compass" />
            </figcaption>
          </figure>
          <p className="inspect" aria-live="polite">
            {crimeText ?? previewText ?? inspectText ?? ' '}
          </p>
          <ul className="legend" aria-label="Habitaciones">
            {roomIds(p).map((rid, i) => (
              <li key={rid} className={previewRefs?.rooms.has(rid) ? 'on' : undefined}>
                <span className={`swatch room-${(i % 8) + 1}`} aria-hidden />
                {roomLabel(p, rid)}
              </li>
            ))}
          </ul>
        </div>

        <div className="people-col">
          {(info || (result && !result.correct) || hint) && (
            <div className="notices">
            {info && (
              <p className="msg hint-msg" role="status">
                {info}
              </p>
            )}
            {result && !result.correct && (
              <p className="msg error" role="status">
                No es correcto. Revisá las pistas e intentá de nuevo (errores: {result.wrongSubmits}).
              </p>
            )}
            {hint && (
              <HintPanel
                  puzzle={p}
                hint={hint}
                free={hint.kind === 'wrong' && bad.has(hint.personId)}
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
            </div>
          )}
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
                    <Monogram person={x} text={short.get(x.id) ?? ''} />
                    <span className="who">
                      <span className="name">
                        <kbd>{i + 1}</kbd> {x.name}
                        {x.role === 'victim' && <span className="tag danger">Víctima</span>}
                      </span>
                      <span className="clue">{clueText(p, x)}</span>
                      {(at || bad.has(x.id)) && (
                        <span className={`chip ${bad.has(x.id) ? 'danger' : 'success'}`}>
                          {bad.has(x.id) ? 'No cumple su pista' : `En el plano · ${colLabel(at!.c)}${at!.r + 1}`}
                        </span>
                      )}
                    </span>
                  </button>
                  <div className="person-actions">
                    <button
                      className={`ghost peek ${pinned === x.id ? 'on' : ''}`}
                      onClick={() => {
                        setPinned((v) => (v === x.id ? null : x.id));
                        // En mobile la lista queda debajo del plano: lo traemos a la vista para ver el resultado.
                        const col = boardRef.current;
                        if (pinned !== x.id && col && col.getBoundingClientRect().top < 0)
                          col.scrollIntoView({ block: 'start', behavior: reducedMotion() ? 'auto' : 'smooth' });
                      }}
                      aria-pressed={pinned === x.id}
                      aria-label={`Ver en el plano dónde puede estar ${x.name}`}
                      title="Ver en el plano"
                    >
                      <Icon name="ui-eye" />
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
              <li>Pasá el mouse por una pista (o tocá el ojo) para ver dónde puede estar esa persona.</li>
              <li>Atajos: números para elegir persona, X marcar, N notas, flechas para moverte, Ctrl+Z deshace. Podés arrastrar las fichas.</li>
            </ul>
          </details>
        </div>
      </div>

      {accusing && <div className="overlay" onClick={() => setAccusing(false)} />}
      {accusing && (
        <dialog open className="modal" aria-label="Acusar">
          <span className="eyebrow danger">Acusación formal</span>
          <h3>¿Quién lo hizo?</h3>
          <div className="suspects">
            {p.people
              .filter((x) => x.role === 'suspect')
              .map((x) => (
                <button key={x.id} className="suspect" onClick={() => accuse(x.id)}>
                  <Monogram person={x} text={short.get(x.id) ?? ''} /> {x.name}
                </button>
              ))}
          </div>
          <button className="ghost" onClick={() => setAccusing(false)} autoFocus>
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
          <Icon name="seal" className="seal" />
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
              {copied ? (
                '✓ Copiado'
              ) : (
                <>
                  <Icon name="ui-copy" /> Copiar resultado
                </>
              )}
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
