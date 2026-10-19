// Ajustes del jugador (por navegador). Se guardan en localStorage con try/catch: si no hay almacenamiento,
// funcionan igual durante la sesión.
import { useSyncExternalStore } from 'react';

export interface Settings {
  /** Marcar al instante a quien no cumple su pista o comparte fila/columna. */
  liveErrors: boolean;
  /** Atenuar la fila y la columna de cada persona ubicada. */
  autoCross: boolean;
  theme: 'system' | 'light' | 'dark';
  tutorialSeen: boolean;
}

const KEY = 'crimen-perfecto:settings';
const DEFAULTS: Settings = { liveErrors: true, autoCross: false, theme: 'system', tutorialSeen: false };

function read(): Settings {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Settings>) };
  } catch {
    return DEFAULTS;
  }
}

let current = read();
const listeners = new Set<() => void>();

function applyTheme(theme: Settings['theme']) {
  if (theme === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', theme);
}
applyTheme(current.theme);

export function updateSettings(patch: Partial<Settings>) {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* sin almacenamiento: vale hasta recargar */
  }
  if (patch.theme) applyTheme(patch.theme);
  listeners.forEach((l) => l());
}

export function useSettings(): Settings {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}
