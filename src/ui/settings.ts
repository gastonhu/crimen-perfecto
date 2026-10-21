// Ajustes del jugador (por navegador). Se guardan en localStorage con try/catch: si no hay almacenamiento,
// funcionan igual durante la sesión.
import { useSyncExternalStore } from 'react';

export interface Settings {
  /** Marcar al instante a quien no cumple su pista o comparte fila/columna. */
  liveErrors: boolean;
  /** Atenuar la fila y la columna de cada persona ubicada. */
  autoCross: boolean;
  theme: 'system' | 'light' | 'dark';
  /** Mostrar el emoji de cada persona en lugar de su inicial (monograma). */
  avatars: boolean;
  tutorialSeen: boolean;
  /** Versión de los ajustes guardados (2: autoCross pasó a venir prendido). */
  v?: number;
}

const KEY = 'crimen-perfecto:settings';
const DEFAULTS: Settings = { liveErrors: true, autoCross: true, theme: 'system', avatars: false, tutorialSeen: false, v: 2 };

function read(): Settings {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Settings>;
    // Antes de la v2 se guardaba autoCross: false aunque nadie lo hubiera elegido: vuelve al valor por defecto.
    if (!saved.v) delete saved.autoCross;
    return { ...DEFAULTS, ...saved, v: 2 };
  } catch {
    return DEFAULTS;
  }
}

let current = read();
const listeners = new Set<() => void>();

function applyTheme(theme: Settings['theme']) {
  if (typeof document === 'undefined') return; // tests en Node
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
