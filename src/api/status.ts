// Estado compartido del backend: si el servidor responde, avisos de sesión vencida y reintentos con backoff.
import { isRetryable } from './types';

export type Connection = 'online' | 'offline';

let connection: Connection = 'online';
const connectionListeners = new Set<() => void>();

/** Último estado conocido de la conexión con el servidor (para `useSyncExternalStore`). */
export const connectionStore = {
  get: (): Connection => connection,
  subscribe(fn: () => void): () => void {
    connectionListeners.add(fn);
    return () => connectionListeners.delete(fn);
  },
};

/** Lo llama el backend después de cada pedido: `true` si hubo respuesta del servidor. */
export function reportConnection(ok: boolean) {
  const next: Connection = ok ? 'online' : 'offline';
  if (next === connection) return;
  connection = next;
  for (const fn of connectionListeners) fn();
}

if (typeof window !== 'undefined') {
  window.addEventListener('offline', () => reportConnection(false));
  // Al volver la red avisamos: quien tenga algo pendiente (p. ej. el progreso) reintenta y, si falla, vuelve a offline.
  window.addEventListener('online', () => reportConnection(true));
}

const sessionListeners = new Set<(token: string) => void>();

/** Se llama cuando el servidor rechaza un token (venció o se cerró la sesión). */
export function onSessionExpired(fn: (token: string) => void): () => void {
  sessionListeners.add(fn);
  return () => sessionListeners.delete(fn);
}

export function reportSessionExpired(token: string) {
  for (const fn of sessionListeners) fn(token);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface RetryOptions {
  /** Intentos en total (el primero incluido). */
  attempts?: number;
  /** Espera antes del primer reintento; se duplica en cada uno (con ±25% de azar). */
  baseMs?: number;
  onRetry?: (attempt: number, error: unknown) => void;
}

/** Reintenta solo los errores de conexión o del servidor (5xx); los rechazos se propagan enseguida. */
export async function withRetry<T>(fn: () => Promise<T>, { attempts = 4, baseMs = 800, onRetry }: RetryOptions = {}) {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= attempts || !isRetryable(e)) throw e;
      onRetry?.(i, e);
      await sleep(baseMs * 2 ** (i - 1) * (0.75 + Math.random() * 0.5));
    }
  }
}
