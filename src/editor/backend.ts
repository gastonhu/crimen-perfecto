// Acceso a datos del editor de casos. La UI solo habla con `EditorBackend`: hoy hay una implementación local
// (localStorage, ver localBackend.ts) y después se enchufa una con Supabase Auth y casos publicados en la base.
import type { Puzzle } from '../engine';
import type { DraftFile, RawSolution } from './draft';

export interface Author {
  email: string;
}

/** Borrador guardado. `key` es interna (estable aunque cambie el id del caso). */
export interface StoredDraft {
  key: string;
  updatedAt: number;
  draft: DraftFile;
  /** Reglas fijadas por el autor para la generación (ver `ruleKey`). */
  pinned?: string[];
  /** Semilla de la última generación de pistas. */
  seed?: number;
}

export interface DraftSummary {
  key: string;
  id: string;
  title: string;
  size: number;
  updatedAt: number;
}

export interface PublishedCase {
  puzzle: Puzzle;
  /** Solo la ve el autor. */
  solution: RawSolution;
  contentHash: string;
  publishedAt: number;
}

export interface PublishedSummary {
  id: string;
  title: string;
  theme: string;
  size: number;
  difficulty: number;
  contentHash: string;
  publishedAt: number;
}

export interface PublishResult {
  id: string;
  contentHash: string;
}

export interface EditorBackend {
  /** 'local': todo queda en este navegador (sin servidor). */
  readonly mode: 'local' | 'remote';
  signIn(email: string, password: string): Promise<Author>;
  signOut(): Promise<void>;
  currentAuthor(): Promise<Author | null>;

  listDrafts(): Promise<DraftSummary[]>;
  loadDraft(key: string): Promise<StoredDraft | null>;
  saveDraft(draft: StoredDraft): Promise<StoredDraft>;
  deleteDraft(key: string): Promise<void>;

  listPublished(): Promise<PublishedSummary[]>;
  loadPublished(id: string): Promise<PublishedCase | null>;
  /**
   * Publica (o reemplaza) un caso: queda jugable al instante. `caso` va sin solución, en el formato v2.
   * Lanza un Error con mensaje en castellano si el caso no es válido o el servidor lo rechaza.
   */
  publish(caso: Puzzle, solucion: RawSolution): Promise<PublishResult>;
  unpublish(id: string): Promise<void>;
}

/** SHA-256 (hex) de un texto. Funciona en el navegador (contexto seguro) y en Node. */
export async function sha256(text: string): Promise<string> {
  const buf = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
