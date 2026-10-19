import { localBackend } from './local';
import { reportConnection, reportSessionExpired } from './status';
import { supabaseBackend } from './supabase';
import { BackendError, type Backend, type Session } from './types';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

const isSession = (x: unknown): x is Session => !!x && typeof x === 'object' && 'token' in x && 'alias' in x;

/**
 * Envuelve un backend para que cada llamada informe el estado de la conexión y avise si el servidor rechazó la
 * sesión (con el token, para que App ignore avisos de una sesión que ya cerró).
 */
export function instrument(b: Backend): Backend {
  const out: Record<string, unknown> = { online: b.online };
  for (const [name, fn] of Object.entries(b)) {
    if (typeof fn !== 'function') continue;
    out[name] = async (...args: unknown[]) => {
      try {
        const r = await (fn as (...a: unknown[]) => Promise<unknown>).apply(b, args);
        if (b.online) reportConnection(true);
        return r;
      } catch (e) {
        if (e instanceof BackendError) {
          if (b.online) reportConnection(e.kind !== 'offline' && e.kind !== 'server');
          if (e.kind === 'session' && isSession(args[0])) reportSessionExpired(args[0].token);
        }
        throw e;
      }
    };
  }
  return out as unknown as Backend;
}

export const backend: Backend = instrument(url && key ? supabaseBackend(url, key) : localBackend);
export * from './types';
export { connectionStore, onSessionExpired, withRetry, type Connection } from './status';
