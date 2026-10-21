// #editor: borradores y casos publicados del autor, crear uno nuevo o importar un JSON.
import { useCallback, useEffect, useState } from 'react';
import { THEMES } from '../puzzles';
import type { DraftSummary, EditorBackend, PublishedSummary, StoredDraft } from './backend';
import { ConfirmDialog, go, setNotice } from './common';
import { MAX_SIZE, MIN_SIZE, newDraft, parseImport, type DraftFile } from './draft';
import { Icon } from '../ui/Icon';

export const newKey = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const when = (t: number) =>
  new Date(t).toLocaleString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export function DraftList({ backend }: { backend: EditorBackend }) {
  const [drafts, setDrafts] = useState<DraftSummary[] | null>(null);
  const [published, setPublished] = useState<PublishedSummary[]>([]);
  const [size, setSize] = useState(5);
  const [paste, setPaste] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ kind: 'draft' | 'published'; id: string; title: string } | null>(null);

  const refresh = useCallback(() => {
    backend.listDrafts().then(setDrafts).catch((e: Error) => setError(e.message));
    backend.listPublished().then(setPublished).catch((e: Error) => setError(e.message));
  }, [backend]);
  useEffect(refresh, [refresh]);

  const open = async (draft: DraftFile, notice: string[] = [], extra: Partial<StoredDraft> = {}) => {
    try {
      const key = newKey();
      await backend.saveDraft({ key, updatedAt: Date.now(), draft, pinned: [], seed: 1, ...extra });
      setNotice(notice);
      go(`#editor/${key}`);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const importText = (text: string) => {
    setError(null);
    try {
      const { draft, warnings } = parseImport(text);
      open(draft, [`Importado: ${draft.title || draft.id}.`, ...warnings]);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const openPublished = async (id: string) => {
    const found = (drafts ?? []).find((d) => d.id === id);
    if (found) return go(`#editor/${found.key}`);
    const pub = await backend.loadPublished(id);
    if (!pub) return setError(`No encontré el caso publicado "${id}".`);
    open({ ...pub.puzzle, epilogue: pub.puzzle.epilogue ?? '', solution: pub.solution }, ['Abriste una copia editable del caso publicado. Para actualizarlo, publicalo de nuevo.']);
  };

  const doDelete = async () => {
    if (!confirm) return;
    try {
      if (confirm.kind === 'draft') await backend.deleteDraft(confirm.id);
      else await backend.unpublish(confirm.id);
    } catch (e) {
      setError((e as Error).message);
    }
    setConfirm(null);
    refresh();
  };

  return (
    <div className="ed-list">
      <h2>Tus casos</h2>
      {error && (
        <p className="msg error" role="alert">
          {error}
        </p>
      )}

      <div className="ed-new card">
        <h3 className="eyebrow">Nuevo caso</h3>
        <div className="row">
          <label className="ed-field-inline">
            Tamaño
            <select value={size} onChange={(e) => setSize(Number(e.target.value))}>
              {Array.from({ length: MAX_SIZE - MIN_SIZE + 1 }, (_, i) => MIN_SIZE + i).map((n) => (
                <option key={n} value={n}>
                  {n}×{n} ({n} personas)
                </option>
              ))}
            </select>
          </label>
          <button className="primary accent" onClick={() => open(newDraft(size))}>
            <Icon name="tool-notes" /> Nuevo caso
          </button>
        </div>
        <details className="ed-import">
          <summary>Importar un JSON (borrador con solución o caso publicado)</summary>
          <label className="ed-file">
            <span>Elegir archivo…</span>
            <input
              type="file"
              accept=".json,application/json"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) f.text().then(importText);
                e.target.value = '';
              }}
            />
          </label>
          <label className="ed-field">
            O pegalo acá
            <textarea rows={5} value={paste} onChange={(e) => setPaste(e.target.value)} spellCheck={false} placeholder='{ "id": "hotel-02", "size": 5, … }' />
          </label>
          <button onClick={() => importText(paste)} disabled={!paste.trim()}>
            Importar
          </button>
        </details>
      </div>

      <section aria-labelledby="ed-drafts">
        <h3 id="ed-drafts" className="eyebrow">
          Borradores
        </h3>
        {drafts === null ? (
          <p className="note">Cargando…</p>
        ) : drafts.length === 0 ? (
          <p className="note">Todavía no hay borradores. Creá uno nuevo o importá un JSON.</p>
        ) : (
          <ul className="ed-items">
            {drafts.map((d) => (
              <li key={d.key} className="card">
                <a className="ed-item-main" href={`#editor/${d.key}`}>
                  <span className="case-title">{d.title || 'Sin título'}</span>
                  <span className="ed-item-meta">
                    <span className="chip">{d.size}×{d.size}</span> <code>{d.id}</code> · {when(d.updatedAt)}
                  </span>
                </a>
                <button className="ghost icon" aria-label={`Borrar el borrador ${d.title || d.id}`} title="Borrar" onClick={() => setConfirm({ kind: 'draft', id: d.key, title: d.title || d.id })}>
                  <Icon name="tool-clear" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="ed-published">
        <h3 id="ed-published" className="eyebrow">
          Publicados
        </h3>
        {published.length === 0 ? (
          <p className="note">Ningún caso publicado desde el editor{backend.mode === 'local' ? ' en este navegador' : ''}.</p>
        ) : (
          <ul className="ed-items">
            {published.map((p) => (
              <li key={p.id} className="card">
                <button className="ed-item-main" onClick={() => openPublished(p.id)}>
                  <span className="case-title">{p.title}</span>
                  <span className="ed-item-meta">
                    <span className="chip">{p.size}×{p.size}</span> <Icon name={THEMES[p.theme]?.icon ?? 'theme-other'} /> <code>{p.id}</code> · dificultad {p.difficulty} ·{' '}
                    {when(p.publishedAt)}
                  </span>
                </button>
                <button className="ghost" onClick={() => setConfirm({ kind: 'published', id: p.id, title: p.title })}>
                  Despublicar
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {confirm && (
        <ConfirmDialog
          title={confirm.kind === 'draft' ? '¿Borrar el borrador?' : '¿Despublicar el caso?'}
          confirm={confirm.kind === 'draft' ? 'Borrar' : 'Despublicar'}
          danger
          onConfirm={doDelete}
          onCancel={() => setConfirm(null)}
        >
          <p>
            {confirm.kind === 'draft'
              ? `"${confirm.title}" se borra para siempre. Si lo querés guardar, exportalo antes.`
              : `"${confirm.title}" deja de estar disponible para jugar. El borrador, si lo tenés, sigue acá.`}
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}
