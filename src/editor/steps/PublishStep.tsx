// Paso 7: publicar (backend.publish) y exportar el JSON del caso (sin solución) y del borrador (con solución).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { fileFormatErrors, logicHash } from '../../engine';
import { THEMES } from '../../puzzles';
import type { EditorBackend, PublishedCase } from '../backend';
import { ConfirmDialog, copyText, downloadText, IssueList, type AnalysisCtx, type StepProps } from '../common';
import { draftFile, publishedCase, toJson } from '../draft';
import type { Issue } from '../issues';
import { peopleIssues, planIssues, solutionIssues } from '../issues';
import { dataIssues } from './DataStep';

type Check = { label: string; state: 'ok' | 'error' | 'warning' | 'pending'; detail?: string };

function JsonBox({ title, file, text, note }: { title: string; file: string; text: string; note: string }) {
  const [copied, setCopied] = useState<'ok' | 'fail' | null>(null);
  return (
    <section className="ed-panel-box ed-json" aria-label={title}>
      <h3 className="eyebrow">{title}</h3>
      <p className="note">{note}</p>
      <div className="row">
        <button
          onClick={async () => {
            setCopied((await copyText(text)) ? 'ok' : 'fail');
            setTimeout(() => setCopied(null), 2000);
          }}
        >
          {copied === 'ok' ? '✓ Copiado' : copied === 'fail' ? 'No se pudo: seleccionalo a mano' : '📋 Copiar'}
        </button>
        <button onClick={() => downloadText(file, text)}>⬇ Descargar {file}</button>
      </div>
      <details>
        <summary>Ver el JSON ({text.length.toLocaleString('es-AR')} caracteres)</summary>
        <textarea className="ed-code" readOnly rows={14} value={text} spellCheck={false} onFocus={(e) => e.target.select()} />
      </details>
    </section>
  );
}

export function PublishStep({
  doc,
  analysis,
  analysisFresh,
  blocked,
  backend,
  clueIssues,
}: StepProps & AnalysisCtx & { backend: EditorBackend; clueIssues: Issue[] }) {
  const d = doc.draft;
  const a = analysisFresh ? analysis.result : null;
  const difficulty = a?.difficulty?.level ?? d.difficulty;
  const caso = useMemo(() => publishedCase(d, difficulty), [d, difficulty]);
  const file = useMemo(() => draftFile(d, difficulty), [d, difficulty]);
  const casoJson = useMemo(() => toJson(caso), [caso]);
  const [existing, setExisting] = useState<PublishedCase | null>(null);
  const [logicChanged, setLogicChanged] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ id: string; contentHash: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    backend
      .loadPublished(d.id)
      .then(setExisting)
      .catch(() => setExisting(null));
  }, [backend, d.id]);
  useEffect(refresh, [refresh]);
  useEffect(() => {
    if (!existing) return setLogicChanged(false);
    let alive = true;
    Promise.all([logicHash(existing.puzzle), logicHash(caso)]).then(([x, y]) => alive && setLogicChanged(x !== y));
    return () => {
      alive = false;
    };
  }, [existing, caso]);

  const errs = (xs: Issue[]) => xs.filter((i) => i.level === 'error');
  const before = [...errs(planIssues(d)), ...errs(peopleIssues(d)), ...errs(solutionIssues(d))];
  const data = dataIssues(d);
  const shape = fileFormatErrors(caso);
  const checks: Check[] = [
    { label: 'Plano, personas y solución', state: before.length ? 'error' : 'ok', detail: before[0]?.text },
    {
      label: 'Las pistas dejan tu solución como única',
      state: blocked ? 'error' : !a ? 'pending' : errs(clueIssues).length ? 'error' : 'ok',
      detail: blocked ? undefined : !a ? 'Analizando…' : errs(clueIssues)[0]?.text,
    },
    {
      label: 'Se resuelve razonando, sin adivinar',
      state: !a?.difficulty ? 'pending' : a.difficulty.needsSearch ? 'warning' : 'ok',
      detail: a?.difficulty?.needsSearch ? 'Se puede publicar, pero conviene ajustar las pistas.' : undefined,
    },
    { label: 'Datos del caso', state: data.length ? 'error' : 'ok', detail: data[0]?.text },
    { label: 'Formato del archivo (v2)', state: shape.length ? 'error' : 'ok', detail: shape[0] },
  ];
  const ready = checks.every((c) => c.state === 'ok' || c.state === 'warning');

  const publish = async () => {
    setConfirming(false);
    setBusy(true);
    setError(null);
    try {
      setResult(await backend.publish(caso, file.solution));
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const path = `puzzles/${caso.theme}/${caso.id}.json`;
  return (
    <div className="ed-step ed-publish">
      <div className="ed-board-col">
        <section className="ed-panel-box" aria-labelledby="ed-check-title">
          <h3 id="ed-check-title" className="eyebrow">
            Antes de publicar
          </h3>
          <ul className="ed-checks">
            {checks.map((c) => (
              <li key={c.label} className={c.state}>
                <span aria-hidden>{c.state === 'ok' ? '✓' : c.state === 'error' ? '✗' : c.state === 'warning' ? '⚠' : '…'}</span>
                <span>
                  {c.label}
                  <span className="sr-only">: {c.state === 'ok' ? 'listo' : c.state === 'error' ? 'falta' : c.state === 'warning' ? 'aviso' : 'pendiente'}</span>
                  {c.detail && <small>{c.detail}</small>}
                </span>
              </li>
            ))}
          </ul>
          <p className="note">
            Dificultad: <strong>{difficulty}/5</strong> (calculada). {existing ? `Ya está publicado (${new Date(existing.publishedAt).toLocaleString('es-AR')}).` : 'Todavía no está publicado.'}
          </p>
          <div className="row">
            <button className="primary accent big" disabled={!ready || busy} onClick={() => (existing ? setConfirming(true) : publish())}>
              {busy ? 'Publicando…' : existing ? 'Volver a publicar' : 'Publicar'}
            </button>
          </div>
          {error && (
            <p className="msg error" role="alert">
              {error}
            </p>
          )}
          {result && (
            <div className="msg solved-banner ed-published" role="status">
              <span>
                ✓ Publicado <code>{result.id}</code> · huella <code>{result.contentHash.slice(0, 12)}</code>
                {backend.mode === 'local' && ' · solo en este navegador'}
              </span>
            </div>
          )}
        </section>

        <section className="ed-panel-box">
          <h3 className="eyebrow">{backend.mode === 'local' ? 'Para publicarlo en el juego (modo local)' : 'Respaldo en el repositorio'}</h3>
          {backend.mode === 'local' && (
            <p className="note">
              En modo local "Publicar" lo guarda solo en este navegador para probar el flujo. Para sumarlo al juego de verdad:
            </p>
          )}
          <ol className="ed-howto">
            <li>
              Descargá el caso y guardalo como <code>{path}</code>.
            </li>
            <li>
              Guardá el borrador (con la solución) en <code>drafts/{caso.id}.json</code>: esa carpeta no va al repositorio.
            </li>
            <li>
              Corré <code>npm run validate</code>: tiene que dar ✓ y la misma dificultad.
            </li>
            <li>
              Con Supabase configurado, <code>npm run publish-puzzle -- {path}</code> sube la solución al servidor.
            </li>
            <li>
              <code>git add {path}</code>, commit y push.
            </li>
          </ol>
          {!(caso.theme in THEMES) && (
            <p className="note">El tema "{caso.theme}" es nuevo: sumalo también a THEMES en src/puzzles.ts.</p>
          )}
        </section>
      </div>
      <div className="ed-side-col">
        <JsonBox title="Caso publicado (sin solución)" file={`${caso.id}.json`} text={casoJson} note={`Para ${path}. Formato v2, con la dificultad calculada.`} />
        <JsonBox
          title="Borrador (con solución)"
          file={`${caso.id}.draft.json`}
          text={toJson(file)}
          note="Para drafts/ o para volver a importarlo en el editor. No lo subas al repositorio: tiene la solución."
        />
        <IssueList issues={shape.map((t) => ({ level: 'error', text: t }))} />
      </div>

      {confirming && (
        <ConfirmDialog
          title="¿Volver a publicar?"
          confirm="Publicar de nuevo"
          danger={logicChanged}
          onConfirm={publish}
          onCancel={() => setConfirming(false)}
        >
          {logicChanged ? (
            <p>
              <strong>Cambió la lógica del caso</strong> (plano, personas, pistas o hechos). Quienes lo estén jugando pierden su intento en curso:
              la solución anterior deja de valer.
            </p>
          ) : (
            <p>Solo cambian textos (título, historia, pistas escritas a mano). Los intentos en curso siguen valiendo.</p>
          )}
        </ConfirmDialog>
      )}
    </div>
  );
}
