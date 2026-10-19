// Paso 4: pistas. Generación automática en el worker (con semilla y reglas fijadas), edición manual por persona,
// hechos generales y el análisis en vivo: soluciones, culpable, dificultad y cadena de deducción.
import { useEffect, useMemo, useState } from 'react';
import {
  OBJECTS,
  TECHNIQUE_NAME,
  candidateRules,
  cellKey,
  clueText,
  describeClue,
  describeFact,
  describeRule,
  roomIds,
  violations,
  type Fact,
  type Rule,
  type Technique,
} from '../../engine';
import { BoardView } from '../../ui/BoardView';
import { boardOf, boardPuzzle, IssueList, type AnalysisCtx, type StepProps } from '../common';
import { factFor, freeObjectsInPlay, ruleKey, toPlacement, toPuzzle } from '../draft';
import type { Issue } from '../issues';
import { fixedRules } from '../state';
import type { GenerateTask } from '../useEngine';

const LEVEL_NAME = ['', 'Muy fácil', 'Fácil', 'Media', 'Difícil', 'Muy difícil'];

function Elapsed({ since }: { since: number | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!since) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [since]);
  return since ? <span className="ed-elapsed">{Math.max(0, Math.round((now - since) / 1000))} s</span> : null;
}

export function AnalysisPanel({ doc, analysis, analysisFresh, blocked, onStep }: Pick<StepProps, 'doc'> & AnalysisCtx & { onStep?: (i: number | null) => void }) {
  const d = doc.draft;
  const a = analysisFresh ? analysis.result : null;
  const name = (id: string | null) => d.people.find((x) => x.id === id)?.name ?? '—';
  const [open, setOpen] = useState<number | null>(null);
  if (blocked) return <p className="note">El análisis arranca cuando el plano, las personas y la solución no tienen errores.</p>;
  return (
    <section className="ed-analysis card" aria-labelledby="ed-analysis-title" aria-busy={analysis.running}>
      <header className="row">
        <h3 id="ed-analysis-title" className="eyebrow">
          Análisis
        </h3>
        {analysis.running && (
          <span className="ed-progress" role="status">
            <span className="ed-spinner" aria-hidden /> Analizando… <Elapsed since={analysis.startedAt} />
            <button className="ghost" onClick={analysis.cancel}>
              Cancelar
            </button>
          </span>
        )}
        {!analysis.running && !a && !analysis.error && <span className="note">Esperando cambios…</span>}
      </header>
      {analysis.error && <p className="error">El análisis falló: {analysis.error}</p>}
      {a && (
        <>
          <dl className="ed-stats">
            <div className={a.solutions === 1 ? 'ok' : 'bad'}>
              <dt>Soluciones</dt>
              <dd>
                {a.capped ? `${a.solutions}+` : a.solutions}
                {a.solutions === 1 && <small>única</small>}
              </dd>
            </div>
            <div>
              <dt>Culpable</dt>
              <dd className="ed-stat-text">{a.solutions === 1 ? name(a.killer) : '—'}</dd>
            </div>
            <div className={a.difficulty?.needsSearch ? 'bad' : ''}>
              <dt>Dificultad</dt>
              <dd>
                {a.difficulty ? `${a.difficulty.level}/5` : '—'}
                {a.difficulty && <small>{a.difficulty.needsSearch ? 'hay que adivinar' : LEVEL_NAME[a.difficulty.level]}</small>}
              </dd>
            </div>
            <div>
              <dt>Pasos</dt>
              <dd>{a.difficulty ? a.difficulty.steps : '—'}</dd>
            </div>
          </dl>
          {a.solutions === 0 && <p className="msg error">Las pistas se contradicen: no hay ninguna ubicación que las cumpla todas.</p>}
          {a.solutions > 1 && (
            <p className="msg error">
              ⚠ No es única: hay {a.capped ? `${a.solutions} o más` : a.solutions} soluciones. Agregá pistas o generalas de nuevo.
            </p>
          )}
          {a.solutions === 1 && !a.matchesAuthor && (
            <p className="msg error">⚠ La única solución de las pistas no es la que elegiste en el paso Solución.</p>
          )}
          {a.difficulty?.needsSearch && (
            <p className="msg error">
              ⚠ La deducción humana no alcanza: en algún momento hay que adivinar. Sumá o cambiá pistas para que se pueda razonar hasta el
              final.
            </p>
          )}
          {a.difficulty && (
            <p className="note">
              Técnicas:{' '}
              {Object.entries(a.difficulty.techniques)
                .map(([t, n]) => `${TECHNIQUE_NAME[t as Technique]} ×${n}`)
                .join(' · ') || 'ninguna'}
            </p>
          )}
          {a.steps.length > 0 && (
            <details className="ed-chain">
              <summary>Cadena de deducción ({a.steps.length} pasos)</summary>
              <ol>
                {a.steps.map((s, i) => (
                  <li key={i}>
                    <button
                      className={`ed-chain-step ${open === i ? 'on' : ''}`}
                      aria-pressed={open === i}
                      onClick={() => {
                        const next = open === i ? null : i;
                        setOpen(next);
                        onStep?.(next);
                      }}
                    >
                      <span className={`chip lvl-${s.level}`}>
                        {s.name} · {s.level}
                      </span>
                      <span>{s.reason}</span>
                    </button>
                  </li>
                ))}
              </ol>
            </details>
          )}
          {a.contradiction && <p className="error">Contradicción: {a.contradiction}</p>}
          <p className="note ed-ms">Calculado en {a.ms} ms.</p>
        </>
      )}
    </section>
  );
}

export function CluesStep({ doc, dispatch, issues, gen, ...ctx }: StepProps & AnalysisCtx & { issues: Issue[]; gen: GenerateTask }) {
  const d = doc.draft;
  const [easy, setEasy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [stepFocus, setStepFocus] = useState<number | null>(null);
  const [factKind, setFactKind] = useState<Fact[0]>('roomCount');
  const [factWhat, setFactWhat] = useState('');
  const p = useMemo(() => boardPuzzle(d), [d]);
  const board = useMemo(() => boardOf(d), [d]);
  const puzzle = useMemo(() => toPuzzle(d), [d]);
  const sol = useMemo(() => toPlacement(d.solution), [d.solution]);
  const canSuggest = !ctx.blocked;
  const wrong = useMemo(() => (canSuggest ? new Set(violations(puzzle, sol)) : new Set<string>()), [canSuggest, puzzle, sol]);
  const fixed = fixedRules(doc);
  const pinnedCount = Object.values(fixed).flat().length;
  const a = ctx.analysisFresh ? ctx.analysis.result : null;
  const focus = a && stepFocus !== null ? new Set(a.steps[stepFocus]?.focus.map(cellKey)) : new Set<string>();

  const generate = async (seed: number) => {
    setMessage(null);
    const r = await gen.run({ kind: 'generate', puzzle, solution: sol, seed, prune: !easy, fixed });
    if (r) {
      dispatch({ type: 'applyClues', puzzle: r.puzzle, seed });
      setMessage(`Pistas nuevas (variante ${seed}${easy ? ', fácil' : ''}) en ${(r.ms / 1000).toFixed(1)} s. Con Ctrl+Z volvés a las anteriores.`);
    }
  };

  const factTargets =
    factKind === 'roomCount'
      ? roomIds(d).map((rid) => ({ id: rid, label: d.roomNames[rid] || rid }))
      : freeObjectsInPlay(d).map((o) => ({ id: o, label: OBJECTS[o].plural }));
  const what = factTargets.some((t) => t.id === factWhat) ? factWhat : (factTargets[0]?.id ?? '');
  const factPreview = what && canSuggest ? factFor(d, factKind, what) : null;

  return (
    <div className="ed-step ed-clues">
      <div className="ed-board-col">
        <section className="ed-panel-box ed-generate" aria-labelledby="ed-gen-title">
          <h3 id="ed-gen-title" className="eyebrow">
            Generar pistas
          </h3>
          <p className="note">
            Elige pistas verdaderas hasta que la solución sea única.{' '}
            {pinnedCount > 0
              ? `Respeta ${pinnedCount === 1 ? 'la regla que fijaste' : `las ${pinnedCount} reglas que fijaste`} (📌).`
              : 'Fijá reglas con 📌 para que las respete.'}
          </p>
          <div className="row">
            <button className="primary accent" onClick={() => generate(doc.seed)} disabled={!canSuggest || gen.running}>
              Generar pistas
            </button>
            <button onClick={() => generate(doc.seed + 1)} disabled={!canSuggest || gen.running}>
              Otra variante
            </button>
            <label className="ed-check">
              <input type="checkbox" checked={easy} onChange={(e) => setEasy(e.target.checked)} />
              Fácil (no quita pistas redundantes)
            </label>
          </div>
          {gen.running && (
            <div className="ed-progress" role="status">
              <span className="ed-spinner" aria-hidden />
              <span className="ed-progress-text">
                {gen.progress?.text ?? 'Preparando…'}
                {gen.progress?.solutions !== undefined && (
                  <small> → quedan {gen.progress.solutions >= 300 ? '300 o más' : gen.progress.solutions} soluciones</small>
                )}
              </span>
              <Elapsed since={gen.startedAt} />
              <button onClick={gen.cancel}>Cancelar</button>
            </div>
          )}
          {gen.error && <p className="msg error">No se pudieron generar: {gen.error}. Probá otra variante, fijá menos reglas o cambiá el plano.</p>}
          {message && !gen.running && <p className="msg hint-msg">{message}</p>}
        </section>
        <BoardView puzzle={p} board={board} bad={wrong} highlight={focus} selected={null} onCell={() => {}} locked />
        <AnalysisPanel doc={doc} {...ctx} onStep={setStepFocus} />
        <IssueList issues={issues} />
      </div>

      <div className="ed-side-col">
        <h3 className="eyebrow">Pistas por persona</h3>
        {!canSuggest && <p className="note">Para elegir reglas a mano, primero completá una solución válida.</p>}
        <ol className="ed-clue-list">
          {d.people.map((x) => {
            const options = canSuggest
              ? candidateRules(puzzle, sol, x.id)
                  .filter((c) => !x.clue.rules.some((r) => JSON.stringify(r) === JSON.stringify(c.rule)))
                  .sort((m, n) => n.interest - m.interest)
              : [];
            return (
              <li key={x.id} className={`card ed-clue ${x.role} ${wrong.has(x.id) ? 'bad' : ''}`}>
                <header>
                  <span className="avatar" aria-hidden>
                    {x.avatar}
                  </span>
                  <strong>{x.name}</strong>
                  {x.role === 'victim' && <span className="tag danger">Víctima</span>}
                </header>
                {(x.clue.rules.length > 0 || x.clue.text) && <p className="ed-clue-text">“{clueText(p, x)}”</p>}
                {wrong.has(x.id) && <p className="error">Esta pista no se cumple con la solución actual.</p>}
                <ul className="ed-rules">
                  {x.clue.rules.map((r, i) => {
                    const pinned = doc.pinned.includes(ruleKey(x.id, r));
                    return (
                      <li key={i}>
                        <span>{describeRule(p, r, x)}</span>
                        <button
                          className={`ghost icon ${pinned ? 'ed-on' : ''}`}
                          aria-pressed={pinned}
                          onClick={() => dispatch({ type: 'togglePin', id: x.id, rule: r })}
                          title={pinned ? 'Fijada: la generación la respeta' : 'Fijar para la generación'}
                          aria-label={`${pinned ? 'Soltar' : 'Fijar'} "${describeRule(p, r, x)}"`}
                        >
                          📌
                        </button>
                        <button className="ghost icon" onClick={() => dispatch({ type: 'removeRule', id: x.id, index: i })} aria-label={`Quitar "${describeRule(p, r, x)}"`}>
                          ×
                        </button>
                      </li>
                    );
                  })}
                  {!x.clue.rules.length && <li className="note">Sin reglas: “No recuerda nada.”</li>}
                </ul>
                {canSuggest && (
                  <select
                    aria-label={`Agregar una regla a ${x.name}`}
                    value=""
                    onChange={(e) => {
                      const opt = options[Number(e.target.value)];
                      if (opt) dispatch({ type: 'addRule', id: x.id, rule: opt.rule as Rule });
                    }}
                  >
                    <option value="">+ Agregar regla verdadera…</option>
                    {options.map((o, i) => (
                      <option key={i} value={i}>
                        {describeRule(p, o.rule, x)}
                      </option>
                    ))}
                  </select>
                )}
                <label className="ed-field">
                  Texto propio (opcional)
                  <input
                    value={x.clue.text ?? ''}
                    placeholder={describeClue(p, x.clue.rules, x)}
                    onChange={(e) => dispatch({ type: 'setClueText', id: x.id, text: e.target.value })}
                  />
                </label>
              </li>
            );
          })}
        </ol>

        <section className="ed-panel-box" aria-labelledby="ed-facts-title">
          <h3 id="ed-facts-title" className="eyebrow">
            Hechos generales
          </h3>
          {(d.facts ?? []).length === 0 && <p className="note">Ninguno. Son datos del caso que no son de una persona.</p>}
          <ul className="ed-facts">
            {(d.facts ?? []).map((f, i) => (
              <li key={i}>
                <span>{describeFact(p, f.fact)}</span>
                <button className="ghost icon" onClick={() => dispatch({ type: 'removeFact', index: i })} aria-label={`Quitar "${describeFact(p, f.fact)}"`}>
                  ×
                </button>
                <input
                  aria-label="Texto propio del hecho"
                  value={f.text ?? ''}
                  placeholder="Texto propio (opcional)"
                  onChange={(e) => dispatch({ type: 'setFactText', index: i, text: e.target.value })}
                />
              </li>
            ))}
          </ul>
          {canSuggest && (
            <div className="row ed-addfact">
              <select aria-label="Tipo de hecho" value={factKind} onChange={(e) => setFactKind(e.target.value as Fact[0])}>
                <option value="roomCount">Gente en una habitación</option>
                <option value="objectCount">Gente sobre un mueble</option>
              </select>
              <select aria-label="Cuál" value={what} onChange={(e) => setFactWhat(e.target.value)} disabled={!factTargets.length}>
                {factTargets.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
              <button onClick={() => factPreview && dispatch({ type: 'addFact', fact: factPreview })} disabled={!factPreview}>
                Agregar
              </button>
              {factPreview && <small className="note">“{describeFact(p, factPreview as Fact)}”</small>}
              {factKind === 'objectCount' && !factTargets.length && <small className="note">No hay sillas, camas ni alfombras en el plano.</small>}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
