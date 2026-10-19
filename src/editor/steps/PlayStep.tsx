// Paso 6: jugar el caso como lo vería un jugador, sin backend ni marcador. "Comprobar" compara con la solución.
import { useMemo, useState } from 'react';
import { cellKey, clueText, describeFact, factViolations, killerOf, violations, type Cell, type Placement } from '../../engine';
import { BoardView } from '../../ui/BoardView';
import type { Board } from '../../ui/useGame';
import { boardPuzzle, cellName, crossedBy, EMPTY_BOARD, type AnalysisCtx, type StepProps } from '../common';
import { toPlacement } from '../draft';

type Verdict = { kind: 'incomplete'; missing: number } | { kind: 'right'; killer: string } | { kind: 'wrong'; wrong: number; valid: boolean };

export function PlayStep({ doc, analysis, analysisFresh, blocked }: StepProps & AnalysisCtx) {
  const d = doc.draft;
  const p = useMemo(() => boardPuzzle(d), [d]);
  const sol = useMemo(() => toPlacement(d.solution), [d.solution]);
  const [board, setBoard] = useState<Board>(EMPTY_BOARD);
  const [selected, setSelected] = useState<string | null>(d.people[0]?.id ?? null);
  const [mode, setMode] = useState<'place' | 'mark'>('place');
  const [live, setLive] = useState(true);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const placements = board.placements as Placement;
  const bad = useMemo(() => (live ? new Set(violations(p, placements)) : new Set<string>()), [live, p, placements]);
  const badFacts = useMemo(() => (live ? new Set(factViolations(p, placements)) : new Set<number>()), [live, p, placements]);
  const a = analysisFresh ? analysis.result : null;
  const name = (id: string | null) => d.people.find((x) => x.id === id)?.name ?? '';

  const update = (b: Board) => {
    setBoard(b);
    setVerdict(null);
  };

  const onCell = (cell: Cell, alt: boolean) => {
    const k = cellKey(cell);
    const occupant = Object.entries(board.placements).find(([, c]) => c && cellKey(c) === k)?.[0];
    if (mode === 'mark' || alt) {
      if (occupant) return;
      return update({ ...board, marks: board.marks.includes(k) ? board.marks.filter((m) => m !== k) : [...board.marks, k] });
    }
    if (!selected || (occupant && occupant !== selected)) return setSelected(occupant ?? null);
    const next = { ...board.placements };
    if (occupant === selected) delete next[selected];
    else next[selected] = cell;
    update({ ...board, placements: next, marks: board.marks.filter((m) => m !== k) });
    const following = d.people.find((x) => x.id !== selected && !board.placements[x.id]);
    if (!board.placements[selected] && following) setSelected(following.id);
  };

  const moveTo = (id: string, cell: Cell) => {
    const next = { ...board.placements };
    for (const [other, c] of Object.entries(next)) if (c && cellKey(c) === cellKey(cell)) delete next[other];
    next[id] = cell;
    update({ ...board, placements: next });
  };

  const check = () => {
    const missing = d.people.filter((x) => !board.placements[x.id]).length;
    if (missing) return setVerdict({ kind: 'incomplete', missing });
    const wrong = d.people.filter((x) => cellKey(board.placements[x.id]!) !== cellKey(sol[x.id])).length;
    if (!wrong) return setVerdict({ kind: 'right', killer: killerOf(p, placements) ?? '' });
    setVerdict({ kind: 'wrong', wrong, valid: violations(p, placements).length === 0 && factViolations(p, placements).length === 0 });
  };

  if (blocked) return <p className="note">Para probar el caso, primero resolvé los errores del plano, las personas y la solución.</p>;

  return (
    <div className="ed-step ed-play">
      <div className="ed-board-col">
        {a && a.solutions !== 1 && (
          <p className="msg error">⚠ Las pistas todavía no dejan una solución única: el caso se puede jugar, pero no tiene una sola respuesta.</p>
        )}
        <p className="story">{d.story || 'Sin historia todavía (se escribe en Datos).'}</p>
        <div className="row ed-play-tools" role="toolbar" aria-label="Herramientas">
          <div className="segmented" role="group" aria-label="Modo">
            <button aria-pressed={mode === 'place'} onClick={() => setMode('place')}>
              👤 Colocar
            </button>
            <button aria-pressed={mode === 'mark'} onClick={() => setMode('mark')}>
              ✗ Marcar
            </button>
          </div>
          <button onClick={() => update(EMPTY_BOARD)}>Empezar de nuevo</button>
          <button className="primary accent" onClick={check}>
            Comprobar
          </button>
        </div>
        <BoardView
          puzzle={p}
          board={board}
          bad={bad}
          highlight={new Set()}
          crossed={crossedBy(board.placements, d.size)}
          selected={selected}
          onCell={onCell}
          onDrop={moveTo}
        />
        <label className="ed-check">
          <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} />
          Marcar al instante quién no cumple su pista
        </label>
        {verdict && (
          <div className={`msg ${verdict.kind === 'right' ? 'solved-banner' : verdict.kind === 'wrong' ? 'error' : 'hint-msg'}`} role="status">
            {verdict.kind === 'incomplete' && `Faltan ubicar ${verdict.missing} ${verdict.missing === 1 ? 'persona' : 'personas'}.`}
            {verdict.kind === 'right' && (
              <span>
                ✓ ¡Correcto! Culpable: {name(verdict.killer)}.{' '}
                {d.epilogue?.includes('{killer}') ? d.epilogue.replaceAll('{killer}', name(verdict.killer)) : ''}
              </span>
            )}
            {verdict.kind === 'wrong' &&
              (verdict.valid
                ? '⚠ Esta ubicación cumple todas las pistas pero no es tu solución: el caso no es único.'
                : `No es correcto: ${verdict.wrong} ${verdict.wrong === 1 ? 'persona está' : 'personas están'} en otro lugar.`)}
          </div>
        )}
      </div>
      <div className="people-col ed-side-col">
        {(d.facts?.length ?? 0) > 0 && (
          <section className="facts">
            <h3 className="eyebrow">Hechos del caso</h3>
            <ul>
              {d.facts!.map((f, i) => (
                <li key={i} className={badFacts.has(i) ? 'bad' : ''}>
                  {f.text ?? describeFact(p, f.fact)}
                </li>
              ))}
            </ul>
          </section>
        )}
        <ol className="people">
          {p.people.map((x) => {
            const at = board.placements[x.id];
            return (
              <li key={x.id} className={['person', x.role, selected === x.id && 'selected', at && 'placed', bad.has(x.id) && 'bad'].filter(Boolean).join(' ')}>
                <button onClick={() => setSelected(x.id)} aria-pressed={selected === x.id}>
                  <span className="avatar">{x.avatar}</span>
                  <span className="who">
                    <span className="name">
                      {x.name}
                      {x.role === 'victim' && <span className="tag danger">Víctima</span>}
                    </span>
                    <span className="clue">{clueText(p, x)}</span>
                    <span className={`chip ${bad.has(x.id) ? 'danger' : at ? 'success' : ''}`}>
                      {bad.has(x.id) ? 'No cumple su pista' : at ? `En el plano · ${cellName(at)}` : 'Sin ubicar'}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
