// Piezas compartidas por los pasos del editor.
import { useEffect, useRef, type ReactNode } from 'react';
import { roomIds, type Cell, type Puzzle } from '../engine';
import type { Board } from '../ui/useGame';
import { toPlacement, toPuzzle, type DraftFile } from './draft';
import type { Issue } from './issues';
import type { Action, EditorDoc } from './state';
import type { AnalysisTask } from './useEngine';

export interface StepProps {
  doc: EditorDoc;
  dispatch: (a: Action) => void;
}

/** Lo que reciben los pasos que usan el análisis en vivo. */
export interface AnalysisCtx {
  analysis: AnalysisTask;
  /** El resultado corresponde al borrador actual. */
  analysisFresh: boolean;
  /** Hay errores de plano, personas o solución: no se analiza. */
  blocked: boolean;
}

/** El borrador listo para BoardView: nombres de respaldo para que nada quede vacío. */
export function boardPuzzle(d: DraftFile): Puzzle {
  const p = toPuzzle(d);
  const roomNames = { ...p.roomNames };
  for (const rid of roomIds(p)) if (!roomNames[rid]?.trim()) roomNames[rid] = `habitación ${rid}`;
  return { ...p, roomNames, people: p.people.map((x) => ({ ...x, name: x.name.trim() || x.id || '?' })) };
}

export const boardOf = (d: DraftFile): Board => ({ placements: toPlacement(d.solution), marks: [], notes: {} });

export const EMPTY_BOARD: Board = { placements: {}, marks: [], notes: {} };

/** Filas y columnas ocupadas por alguien ubicado (para tacharlas). */
export function crossedBy(placements: Partial<Record<string, Cell>>, size: number): Set<string> {
  const set = new Set<string>();
  for (const c of Object.values(placements))
    if (c)
      for (let i = 0; i < size; i++) {
        set.add(`${c.r},${i}`);
        set.add(`${i},${c.c}`);
      }
  return set;
}

export const cellName = (c: Cell) => `${String.fromCharCode(65 + c.c)}${c.r + 1}`;

export function IssueList({ issues, ok }: { issues: Issue[]; ok?: string }) {
  if (!issues.length) return ok ? <p className="ed-ok">✓ {ok}</p> : null;
  return (
    <ul className="ed-issues" aria-label="Problemas">
      {issues.map((i, k) => (
        <li key={k} className={i.level}>
          <span aria-hidden>{i.level === 'error' ? '✗' : '⚠'}</span>
          <span>
            <span className="sr-only">{i.level === 'error' ? 'Error: ' : 'Aviso: '}</span>
            {i.text}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Diálogo de confirmación con el foco en la opción segura y Escape para cancelar. */
export function ConfirmDialog({
  title,
  children,
  confirm,
  danger,
  onConfirm,
  onCancel,
}: {
  title: string;
  children: ReactNode;
  confirm: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);
  return (
    <>
      <div className="overlay" onClick={onCancel} />
      <dialog open className="modal" aria-label={title}>
        <h3>{title}</h3>
        <div className="ed-dialog-body">{children}</div>
        <div className="row">
          <button ref={cancelRef} onClick={onCancel}>
            Cancelar
          </button>
          <button className={danger ? 'danger' : 'primary accent'} onClick={onConfirm}>
            {confirm}
          </button>
        </div>
      </dialog>
    </>
  );
}

/** Copiar al portapapeles con respaldo (selección manual) si la API no está disponible. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Descarga un texto como archivo, generado en el navegador (no sale nada a la red). */
export function downloadText(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Navega dentro de la app (la ruta vive en location.hash). */
export const go = (hash: string) => {
  if (hash) {
    location.hash = hash;
    return;
  }
  // Volver al juego sin dejar un "#" colgado en la URL.
  history.pushState(null, '', location.pathname + location.search);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
};

// Avisos para mostrar al abrir un borrador recién creado o importado (sobreviven a la navegación por hash).
let notice: string[] = [];
export const setNotice = (lines: string[]) => {
  notice = lines;
};
export const takeNotice = () => {
  const out = notice;
  notice = [];
  return out;
};
