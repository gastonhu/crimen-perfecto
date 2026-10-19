// Paso 5: datos del caso (id, tema, título, historia, epílogo). La dificultad es la calculada.
import { useState } from 'react';
import { fileFormatErrors } from '../../engine';
import { THEMES } from '../../puzzles';
import { IssueList, type AnalysisCtx, type StepProps } from '../common';
import { publishedCase, slug } from '../draft';
import type { Issue } from '../issues';
import type { Action } from '../state';

const FIELDS: Record<string, string> = {
  id: 'Identificador',
  theme: 'Tema',
  title: 'Título',
  story: 'Historia',
  epilogue: 'Epílogo',
};

/** Problemas de los datos del caso (los demás campos los cubren los otros pasos). */
export function dataIssues(d: Parameters<typeof publishedCase>[0]): Issue[] {
  return fileFormatErrors(publishedCase(d, 1))
    .map((e) => e.split(': '))
    .filter(([path]) => FIELDS[path])
    .map(([path, ...rest]) => ({ level: 'error' as const, text: `${FIELDS[path]}: ${rest.join(': ')}.` }));
}

export function DataStep({ doc, dispatch, analysis, analysisFresh }: StepProps & AnalysisCtx) {
  const d = doc.draft;
  const known = Object.keys(THEMES);
  const [custom, setCustom] = useState(!known.includes(d.theme));
  const a = analysisFresh ? analysis.result : null;
  const killer = d.people.find((x) => x.id === a?.killer)?.name ?? d.people.find((x) => x.role === 'suspect')?.name ?? 'el culpable';
  const set = (patch: Extract<Action, { type: 'setMeta' }>['patch']) => dispatch({ type: 'setMeta', patch });
  const issues = dataIssues(d);

  return (
    <div className="ed-step ed-data">
      <div className="ed-form">
        <label className="ed-field">
          Título
          <input value={d.title} maxLength={60} onChange={(e) => set({ title: e.target.value })} placeholder="Corte de luz en el Gran Hotel" />
          <small className="note">{d.title.length}/60</small>
        </label>
        <label className="ed-field">
          Identificador
          <span className="row">
            <input
              value={d.id}
              spellCheck={false}
              onChange={(e) => set({ id: e.target.value.toLowerCase() })}
              aria-describedby="ed-id-help"
              aria-invalid={!/^[a-z0-9-]+$/.test(d.id)}
            />
            <button type="button" onClick={() => set({ id: slug(d.title || d.id) })} disabled={!d.title}>
              Desde el título
            </button>
          </span>
          <small id="ed-id-help" className="note">
            Minúsculas, números y guiones. Es el nombre del archivo y el link del caso (por ejemplo, hotel-02).
          </small>
        </label>
        <label className="ed-field">
          Tema
          <select
            value={custom ? '__otro' : d.theme}
            onChange={(e) => {
              if (e.target.value === '__otro') return setCustom(true);
              setCustom(false);
              set({ theme: e.target.value });
            }}
          >
            {known.map((t) => (
              <option key={t} value={t}>
                {THEMES[t].icon} {THEMES[t].name}
              </option>
            ))}
            <option value="__otro">Otro tema…</option>
          </select>
        </label>
        {custom && (
          <label className="ed-field">
            Tema nuevo (identificador)
            <input value={d.theme} spellCheck={false} onChange={(e) => set({ theme: e.target.value.toLowerCase() })} placeholder="museo" />
            <small className="note">Un tema nuevo también hay que sumarlo a THEMES en src/puzzles.ts para que aparezca en el selector.</small>
          </label>
        )}
        <label className="ed-field">
          Historia
          <textarea rows={4} value={d.story} onChange={(e) => set({ story: e.target.value })} placeholder="Noche de tormenta en el Gran Hotel…" />
        </label>
        <label className="ed-field">
          Epílogo
          <textarea
            rows={3}
            value={d.epilogue ?? ''}
            onChange={(e) => set({ epilogue: e.target.value })}
            placeholder="{killer} aprovechó el apagón para quedarse a solas con…"
          />
          <small className="note">
            Se muestra al resolverlo. Escribí <code>{'{killer}'}</code> donde va el nombre del culpable.
          </small>
        </label>
        {d.epilogue?.includes('{killer}') && <p className="story">{d.epilogue.replaceAll('{killer}', killer)}</p>}
      </div>
      <div className="ed-side-col">
        <section className="ed-panel-box">
          <h3 className="eyebrow">Dificultad</h3>
          {a?.difficulty ? (
            <p>
              <strong className="ed-big">{a.difficulty.level}/5</strong> calculada a partir de la técnica más difícil que hace falta.
              {a.difficulty.needsSearch && <span className="error"> Hay que adivinar: conviene revisar las pistas.</span>}
            </p>
          ) : (
            <p className="note">Se calcula cuando las pistas dejan una solución única.</p>
          )}
        </section>
        <IssueList issues={issues} ok="Los datos están completos." />
      </div>
    </div>
  );
}
