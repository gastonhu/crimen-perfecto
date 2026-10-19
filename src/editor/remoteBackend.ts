// Backend del editor con Supabase: autores con Supabase Auth (email + contraseña) y casos/borradores en la base
// vía las funciones cp_author_* (ver supabase/migrations/20261021000000_autores.sql). Sin supabase-js: fetch
// contra /auth/v1 (GoTrue) y /rest/v1 (PostgREST), igual que el cliente del juego.
import { killerOf, logicHash, type Puzzle } from '../engine';
import { toBackendError } from '../api/supabase';
import type { Author, DraftSummary, EditorBackend, PublishedCase, PublishedSummary, StoredDraft } from './backend';
import { fromPlacement, toPlacement, type RawSolution } from './draft';
import { publishErrors } from './publishCheck';

interface AuthSession {
  access_token: string;
  refresh_token: string;
  /** Segundos epoch en que vence el access token. */
  expires_at: number;
  email: string;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at?: number;
  user?: { email?: string };
  error_description?: string;
  msg?: string;
  error?: string;
}

const SESSION_KEY = 'crimen-perfecto:author-session';
const TIMEOUT_MS = 20_000;

/** Mensajes de GoTrue traducidos al castellano. */
function authMessage(body: TokenResponse | null, status: number): string {
  const raw = `${body?.error_description ?? body?.msg ?? body?.error ?? ''}`.toLowerCase();
  if (raw.includes('invalid login') || raw.includes('invalid_grant') || raw.includes('invalid credentials'))
    return 'Email o contraseña incorrectos.';
  if (raw.includes('email not confirmed')) return 'Tenés que confirmar el email antes de ingresar.';
  if (raw.includes('refresh token')) return 'Tu sesión de autor venció. Volvé a ingresar.';
  if (status === 429) return 'Demasiados intentos. Esperá un rato y probá de nuevo.';
  if (status >= 500) return 'El servidor de autenticación no responde. Probá de nuevo en un rato.';
  return raw ? `No se pudo ingresar: ${raw}` : `No se pudo ingresar (error ${status}).`;
}

export function createRemoteBackend(url: string, anonKey: string, fetchImpl: typeof fetch = (...a) => fetch(...a)): EditorBackend {
  const root = url.replace(/\/+$/, '');

  const readSession = (): AuthSession | null => {
    try {
      const s = JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null') as AuthSession | null;
      return s && typeof s.access_token === 'string' ? s : null;
    } catch {
      return null;
    }
  };
  let session: AuthSession | null = readSession();
  const saveSession = (s: AuthSession | null) => {
    session = s;
    try {
      if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
      else localStorage.removeItem(SESSION_KEY);
    } catch {
      /* sin almacenamiento: la sesión dura hasta recargar */
    }
  };

  async function call(path: string, init: RequestInit): Promise<{ status: number; body: unknown }> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetchImpl(`${root}${path}`, { ...init, signal: ctrl.signal });
      const text = await res.text();
      let body: unknown = null;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        body = null;
      }
      return { status: res.status, body };
    } catch {
      throw new Error(
        ctrl.signal.aborted ? 'El servidor tardó demasiado en responder.' : 'No hay conexión con el servidor. Revisá tu internet.',
      );
    } finally {
      clearTimeout(timer);
    }
  }

  async function token(grant: 'password' | 'refresh_token', payload: Record<string, string>): Promise<AuthSession> {
    const { status, body } = await call(`/auth/v1/token?grant_type=${grant}`, {
      method: 'POST',
      headers: { apikey: anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const b = body as TokenResponse | null;
    if (status !== 200 || !b?.access_token) throw new Error(authMessage(b, status));
    return {
      access_token: b.access_token,
      refresh_token: b.refresh_token,
      expires_at: b.expires_at ?? Math.floor(Date.now() / 1000) + b.expires_in,
      email: b.user?.email ?? session?.email ?? '',
    };
  }

  /** Access token vigente (lo renueva si vence en menos de un minuto). */
  async function accessToken(): Promise<string> {
    if (!session) throw new Error('Ingresá con tu cuenta de autor.');
    if (session.expires_at - 60 < Date.now() / 1000) {
      try {
        saveSession(await token('refresh_token', { refresh_token: session.refresh_token }));
      } catch (e) {
        saveSession(null);
        throw e;
      }
    }
    return session!.access_token;
  }

  async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
    const jwt = await accessToken();
    const { status, body } = await call(`/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { apikey: anonKey, Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    });
    if (status >= 200 && status < 300) return body as T;
    if (status === 401) {
      saveSession(null);
      throw new Error('Tu sesión de autor venció. Volvé a ingresar.');
    }
    throw new Error(toBackendError(status, body, `la función ${fn}`).message);
  }

  return {
    mode: 'remote',

    async signIn(email, password) {
      if (!email.trim() || !password) throw new Error('Completá el email y la contraseña.');
      saveSession(await token('password', { email: email.trim(), password }));
      try {
        const me = await rpc<{ email: string }>('cp_author_whoami');
        return { email: me.email };
      } catch (e) {
        // La cuenta existe pero no está en la lista de autores: no la dejamos logueada.
        await this.signOut();
        throw e;
      }
    },

    async signOut() {
      const s = session;
      saveSession(null);
      if (s)
        await call('/auth/v1/logout', { method: 'POST', headers: { apikey: anonKey, Authorization: `Bearer ${s.access_token}` } }).catch(
          () => {},
        );
    },

    async currentAuthor(): Promise<Author | null> {
      if (!session) return null;
      try {
        return { email: (await rpc<{ email: string }>('cp_author_whoami')).email };
      } catch {
        return null;
      }
    },

    async listDrafts(): Promise<DraftSummary[]> {
      const rows = await rpc<{ key: string; data: Omit<StoredDraft, 'key' | 'updatedAt'>; updated_at: string }[]>('cp_author_list_drafts');
      return rows.map((r) => ({
        key: r.key,
        id: r.data.draft?.id ?? r.key,
        title: r.data.draft?.title ?? '(sin título)',
        size: r.data.draft?.size ?? 0,
        updatedAt: Date.parse(r.updated_at),
      }));
    },

    async loadDraft(key) {
      const r = await rpc<{ key: string; data: Omit<StoredDraft, 'key' | 'updatedAt'>; updated_at: string } | null>(
        'cp_author_get_draft',
        { p_key: key },
      );
      return r ? { ...r.data, key: r.key, updatedAt: Date.parse(r.updated_at) } : null;
    },

    async saveDraft(d) {
      const { key, updatedAt: _u, ...data } = d;
      const at = await rpc<string>('cp_author_save_draft', { p_key: key, p_data: data });
      return { ...d, updatedAt: Date.parse(at) };
    },

    async deleteDraft(key) {
      await rpc('cp_author_delete_draft', { p_key: key });
    },

    async listPublished(): Promise<PublishedSummary[]> {
      const rows = await rpc<
        {
          id: string;
          title: string;
          theme: string;
          size: number;
          difficulty: number;
          content_hash: string | null;
          published: boolean;
          published_at: string;
          has_data: boolean;
        }[]
      >('cp_author_list');
      return rows
        .filter((r) => r.published && r.has_data)
        .map((r) => ({
          id: r.id,
          title: r.title,
          theme: r.theme,
          size: r.size,
          difficulty: r.difficulty,
          contentHash: r.content_hash ?? '',
          publishedAt: Date.parse(r.published_at),
        }));
    },

    async loadPublished(id): Promise<PublishedCase | null> {
      const r = await rpc<{
        puzzle: Puzzle | null;
        solution: Record<string, { r: number; c: number }> | null;
        content_hash: string | null;
        published_at: string;
      } | null>('cp_author_get', { p_id: id });
      if (!r?.puzzle || !r.solution) return null;
      return {
        puzzle: r.puzzle,
        solution: fromPlacement(r.solution),
        contentHash: r.content_hash ?? '',
        publishedAt: Date.parse(r.published_at),
      };
    },

    async publish(caso: Puzzle, solucion: RawSolution) {
      // El servidor no puede correr el solver: verificamos acá lo mismo que `npm run validate`.
      const errs = publishErrors(caso, solucion);
      if (errs.length) throw new Error(errs.join(' '));
      const placement = toPlacement(solucion);
      const killer = killerOf(caso, placement);
      if (!killer) throw new Error('La solución no deja un único culpable.');
      const contentHash = await logicHash(caso);
      const r = await rpc<{ id: string; content_hash: string }>('cp_author_publish', {
        p_puzzle: caso,
        p_solution: placement,
        p_killer: killer,
        p_content_hash: contentHash,
      });
      return { id: r.id, contentHash: r.content_hash };
    },

    async unpublish(id) {
      await rpc('cp_author_unpublish', { p_id: id });
    },
  };
}
