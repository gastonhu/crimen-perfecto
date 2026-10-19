// Implementación local de EditorBackend: todo en el almacenamiento del navegador (o en memoria si no hay).
// Cualquier email y contraseña no vacíos entran: es para probar el flujo sin servidor.
import type { Puzzle } from '../engine';
import { sha256, type Author, type DraftSummary, type EditorBackend, type PublishedCase, type PublishedSummary, type StoredDraft } from './backend';
import type { RawSolution } from './draft';
import { publishErrors } from './publishCheck';

/** Lo mínimo de Storage que se usa (así los tests pueden pasar uno en memoria). */
export interface KeyValue {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const PREFIX = 'crimen-perfecto:editor';
const AUTHOR = `${PREFIX}:author`;
const DRAFTS = `${PREFIX}:drafts`;
const PUBLISHED = `${PREFIX}:published`;

export function memoryStorage(): KeyValue {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
}

/** localStorage si se puede usar; si no (modo privado, bloqueado), memoria: el editor funciona pero no guarda. */
export function browserStorage(): KeyValue {
  const mem = memoryStorage();
  const safe = <T>(fn: () => T, fallback: () => T) => {
    try {
      return fn();
    } catch {
      return fallback();
    }
  };
  return {
    getItem: (k) => safe(() => globalThis.localStorage.getItem(k), () => mem.getItem(k)),
    setItem: (k, v) => safe(() => globalThis.localStorage.setItem(k, v), () => mem.setItem(k, v)),
    removeItem: (k) => safe(() => globalThis.localStorage.removeItem(k), () => mem.removeItem(k)),
  };
}

export function createLocalBackend(store: KeyValue = browserStorage()): EditorBackend {
  const read = <T>(key: string, fallback: T): T => {
    try {
      return (JSON.parse(store.getItem(key) ?? 'null') as T) ?? fallback;
    } catch {
      return fallback;
    }
  };
  const write = (key: string, value: unknown) => {
    try {
      store.setItem(key, JSON.stringify(value));
    } catch {
      throw new Error('No hay lugar en el almacenamiento del navegador para guardar.');
    }
  };
  const drafts = () => read<Record<string, StoredDraft>>(DRAFTS, {});
  const published = () => read<Record<string, PublishedCase>>(PUBLISHED, {});

  return {
    mode: 'local',

    async signIn(email, password) {
      if (!email.trim() || !password) throw new Error('Completá el email y la contraseña.');
      const author: Author = { email: email.trim() };
      write(AUTHOR, author);
      return author;
    },
    async signOut() {
      store.removeItem(AUTHOR);
    },
    async currentAuthor() {
      const a = read<Author | null>(AUTHOR, null);
      return a && typeof a.email === 'string' ? { email: a.email } : null;
    },

    async listDrafts(): Promise<DraftSummary[]> {
      return Object.values(drafts())
        .map((s) => ({ key: s.key, id: s.draft.id, title: s.draft.title, size: s.draft.size, updatedAt: s.updatedAt }))
        .sort((a, b) => b.updatedAt - a.updatedAt);
    },
    async loadDraft(key) {
      return drafts()[key] ?? null;
    },
    async saveDraft(d) {
      const saved: StoredDraft = { ...d, updatedAt: Date.now() };
      write(DRAFTS, { ...drafts(), [d.key]: saved });
      return saved;
    },
    async deleteDraft(key) {
      const all = drafts();
      delete all[key];
      write(DRAFTS, all);
    },

    async listPublished(): Promise<PublishedSummary[]> {
      return Object.values(published())
        .map(({ puzzle: p, contentHash, publishedAt }) => ({
          id: p.id,
          title: p.title,
          theme: p.theme,
          size: p.size,
          difficulty: p.difficulty,
          contentHash,
          publishedAt,
        }))
        .sort((a, b) => b.publishedAt - a.publishedAt);
    },
    async loadPublished(id) {
      return published()[id] ?? null;
    },
    async publish(caso: Puzzle, solucion: RawSolution) {
      const errs = publishErrors(caso, solucion);
      if (errs.length) throw new Error(`No se puede publicar: ${errs.join(' ')}`);
      const contentHash = await sha256(JSON.stringify(caso));
      write(PUBLISHED, { ...published(), [caso.id]: { puzzle: caso, solution: solucion, contentHash, publishedAt: Date.now() } });
      return { id: caso.id, contentHash };
    },
    async unpublish(id) {
      const all = published();
      if (!all[id]) throw new Error(`No hay ningún caso publicado con el id "${id}".`);
      delete all[id];
      write(PUBLISHED, all);
    },
  };
}

/** La instancia que usa la app. Para conectar un servidor, reemplazá esto por otra implementación de EditorBackend. */
