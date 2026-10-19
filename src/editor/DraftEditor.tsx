// #editor/<borrador>: los pasos del editor sobre un borrador, con guardado automático y análisis en vivo.
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { logicFingerprint } from '../engine';
import type { EditorBackend, StoredDraft } from './backend';
import { go, takeNotice } from './common';
import { toPlacement, toPuzzle } from './draft';
import { peopleIssues, planIssues, solutionIssues, type Issue } from './issues';
import { reduceHistory, type Action, type EditorDoc, type History, type HistoryAction } from './state';
import type { Analysis, GenerateResult } from './tasks';
import { useEngineTask } from './useEngine';
import { PlanStep } from './steps/PlanStep';
import { PeopleStep } from './steps/PeopleStep';
import { SolutionStep } from './steps/SolutionStep';
import { CluesStep } from './steps/CluesStep';
import { DataStep, dataIssues } from './steps/DataStep';
import { PlayStep } from './steps/PlayStep';
import { PublishStep } from './steps/PublishStep';

const STEPS = [
  { id: 'plan', label: 'Plano' },
  { id: 'people', label: 'Personas' },
  { id: 'solution', label: 'Solución' },
  { id: 'clues', label: 'Pistas' },
  { id: 'data', label: 'Datos' },
  { id: 'play', label: 'Probar' },
  { id: 'publish', label: 'Publicar' },
] as const;
export type StepId = (typeof STEPS)[number]['id'];

const EMPTY: History = { past: [], present: { draft: null!, pinned: [], seed: 1 }, future: [] };

export function DraftEditor({ draftKey, backend }: { draftKey: string; backend: EditorBackend }) {
  const [loaded, setLoaded] = useState<'loading' | 'missing' | 'ok'>('loading');
  const [history, dispatchH] = useReducer(reduceHistory, EMPTY);
  const dispatch = useCallback((a: Action) => dispatchH(a), []);
  const [step, setStep] = useState<StepId>('plan');
  const [save, setSave] = useState<'saved' | 'saving' | 'error'>('saved');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [notice, setNoticeLines] = useState<string[]>([]);
  const doc = history.present;
  const d = doc.draft;

  useEffect(() => {
    let alive = true;
    backend.loadDraft(draftKey).then((s) => {
      if (!alive) return;
      if (!s) return setLoaded('missing');
      dispatchH({ type: 'load', doc: { draft: s.draft, pinned: s.pinned ?? [], seed: s.seed ?? 1 } } satisfies HistoryAction);
      setNoticeLines(takeNotice());
      setLoaded('ok');
    });
    return () => {
      alive = false;
    };
  }, [backend, draftKey]);

  // Guardado automático (con un respiro para no escribir en cada tecla) y al salir.
  const latest = useRef<EditorDoc | null>(null);
  const dirty = useRef(false);
  const persist = useCallback(
    async (x: EditorDoc) => {
      const stored: StoredDraft = { key: draftKey, updatedAt: Date.now(), draft: x.draft, pinned: x.pinned, seed: x.seed };
      try {
        await backend.saveDraft(stored);
        dirty.current = false;
        setSave('saved');
        setSaveError(null);
      } catch (e) {
        setSave('error');
        setSaveError((e as Error).message);
      }
    },
    [backend, draftKey],
  );
  useEffect(() => {
    if (loaded !== 'ok') return;
    if (latest.current === null) {
      latest.current = doc;
      return;
    }
    if (latest.current === doc) return;
    latest.current = doc;
    dirty.current = true;
    setSave('saving');
    const t = setTimeout(() => persist(doc), 500);
    return () => clearTimeout(t);
  }, [doc, loaded, persist]);
  useEffect(
    () => () => {
      if (dirty.current && latest.current) persist(latest.current);
    },
    [persist],
  );

  // Deshacer / rehacer con el teclado (fuera de los campos de texto, que tienen el suyo).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return;
      if ((e.target as HTMLElement).closest('input, textarea, select')) return;
      e.preventDefault();
      dispatchH({ type: e.shiftKey ? 'redo' : 'undo' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Análisis en vivo (en el worker) cada vez que cambia la lógica, la solución o los nombres.
  const analysis = useEngineTask<Analysis>();
  // La generación vive acá (y no en el paso Pistas) para que cambiar de pestaña no la corte.
  const gen = useEngineTask<GenerateResult>();
  const issues = useMemo(() => {
    if (!d) return null;
    const plan = planIssues(d);
    const people = peopleIssues(d);
    const solution = solutionIssues(d);
    return { plan, people, solution };
  }, [d]);
  const blocked = !issues || [...issues.plan, ...issues.people, ...issues.solution].some((i) => i.level === 'error');
  const analysisKey = useMemo(
    () =>
      d &&
      JSON.stringify([logicFingerprint(toPuzzle(d)), d.solution, d.people.map((x) => [x.name, x.gender]), d.roomNames]),
    [d],
  );
  const [analyzedKey, setAnalyzedKey] = useState<string | null>(null);
  const { run: runAnalysis, cancel: cancelAnalysis } = analysis;
  useEffect(() => {
    if (!d || blocked) {
      cancelAnalysis();
      return;
    }
    const key = analysisKey;
    const t = setTimeout(() => {
      runAnalysis({ kind: 'analyze', puzzle: toPuzzle(d), solution: toPlacement(d.solution) }).then((r) => r && setAnalyzedKey(key));
    }, 350);
    return () => clearTimeout(t);
    // Solo cuando cambia lo que se analiza.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysisKey, blocked]);
  const fresh = !blocked && analyzedKey === analysisKey && !!analysis.result;

  if (loaded === 'loading') return <p className="note">Abriendo el borrador…</p>;
  if (loaded === 'missing')
    return (
      <div className="card ed-missing">
        <p>No encontré ese borrador.</p>
        <button onClick={() => go('#editor')}>← Tus casos</button>
      </div>
    );

  const a = fresh ? analysis.result : null;
  const clueIssues: Issue[] = blocked
    ? [{ level: 'error', text: 'Primero resolvé los errores del plano, las personas y la solución.' }]
    : !a
      ? []
      : [
          ...(a.solutions === 0 ? [{ level: 'error' as const, text: 'Las pistas no tienen solución.' }] : []),
          ...(a.solutions > 1 ? [{ level: 'error' as const, text: `Las pistas admiten ${a.capped ? `${a.solutions} o más` : a.solutions} soluciones.` }] : []),
          ...(a.solutions === 1 && !a.matchesAuthor ? [{ level: 'error' as const, text: 'La solución de las pistas no es la que elegiste.' }] : []),
          ...(a.difficulty?.needsSearch ? [{ level: 'warning' as const, text: 'La deducción no alcanza: hay que adivinar.' }] : []),
        ];
  const status: Record<StepId, 'ok' | 'error' | 'warning' | 'idle'> = {
    plan: level(issues!.plan),
    people: level(issues!.people),
    solution: level(issues!.solution),
    clues: a || blocked ? level(clueIssues) : 'idle',
    data: level(dataIssues(d)),
    play: 'idle',
    publish: 'idle',
  };
  const props = { doc, dispatch };
  const ctx = { analysis, analysisFresh: fresh, blocked };

  return (
    <div className="ed-doc">
      <header className="ed-head">
        <button className="ghost back" onClick={() => go('#editor')} aria-label="Volver a tus casos">
          ←<span className="hide-sm"> Casos</span>
        </button>
        <div className="title">
          <span className="eyebrow">
            Borrador · {d.size}×{d.size} · <code>{d.id}</code>
          </span>
          <h2>{d.title || 'Caso sin título'}</h2>
        </div>
        <div className="ed-head-tools">
          <button className="ghost icon" onClick={() => dispatchH({ type: 'undo' })} disabled={!history.past.length} aria-label="Deshacer" title="Deshacer (Ctrl+Z)">
            ↶
          </button>
          <button className="ghost icon" onClick={() => dispatchH({ type: 'redo' })} disabled={!history.future.length} aria-label="Rehacer" title="Rehacer (Ctrl+Shift+Z)">
            ↷
          </button>
          <span className={`ed-save ${save}`} role="status" title={saveError ?? undefined}>
            {save === 'saved' ? '✓ Guardado' : save === 'saving' ? 'Guardando…' : '✗ No se guardó'}
          </span>
        </div>
      </header>
      {saveError && <p className="msg error">{saveError}</p>}
      {notice.length > 0 && (
        <div className="msg hint-msg ed-notice" role="status">
          <ul>
            {notice.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
          <button className="ghost icon" onClick={() => setNoticeLines([])} aria-label="Cerrar aviso">
            ×
          </button>
        </div>
      )}

      <nav className="ed-tabs" role="tablist" aria-label="Pasos">
        {STEPS.map((s, i) => (
          <button
            key={s.id}
            role="tab"
            id={`ed-tab-${s.id}`}
            aria-selected={step === s.id}
            aria-controls="ed-panel"
            className={`ed-tab ${status[s.id]}`}
            onClick={() => setStep(s.id)}
          >
            <span className="ed-tab-n">{i + 1}</span> {s.label}
            {status[s.id] === 'error' && <span className="ed-dot error" aria-label="con errores" />}
            {status[s.id] === 'warning' && <span className="ed-dot warning" aria-label="con avisos" />}
            {status[s.id] === 'ok' && <span className="ed-dot ok" aria-label="listo" />}
          </button>
        ))}
      </nav>

      <div id="ed-panel" role="tabpanel" aria-labelledby={`ed-tab-${step}`} className="ed-panel">
        {step === 'plan' && <PlanStep {...props} issues={issues!.plan} />}
        {step === 'people' && <PeopleStep {...props} issues={issues!.people} />}
        {step === 'solution' && <SolutionStep {...props} issues={issues!.solution} />}
        {step === 'clues' && <CluesStep {...props} {...ctx} issues={clueIssues} gen={gen} />}
        {step === 'data' && <DataStep {...props} {...ctx} />}
        {step === 'play' && <PlayStep {...props} {...ctx} />}
        {step === 'publish' && <PublishStep {...props} {...ctx} backend={backend} clueIssues={clueIssues} />}
      </div>

      <div className="ed-stepnav">
        {STEPS.findIndex((s) => s.id === step) > 0 && (
          <button onClick={() => setStep(STEPS[STEPS.findIndex((s) => s.id === step) - 1].id)}>← Anterior</button>
        )}
        {STEPS.findIndex((s) => s.id === step) < STEPS.length - 1 && (
          <button className="primary" onClick={() => setStep(STEPS[STEPS.findIndex((s) => s.id === step) + 1].id)}>
            Siguiente →
          </button>
        )}
      </div>
    </div>
  );
}

function level(issues: Issue[]): 'ok' | 'error' | 'warning' {
  return issues.some((i) => i.level === 'error') ? 'error' : issues.length ? 'warning' : 'ok';
}
