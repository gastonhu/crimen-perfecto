// Cliente del worker del motor: una tarea a la vez por canal, con progreso y cancelación. Cancelar termina el
// worker (los cálculos son sincrónicos y no se pueden interrumpir de otra forma) y crea uno nuevo al próximo uso.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Analysis, AnalyzeRequest, GenerateRequest, GenerateResult, Progress } from './tasks';
import type { WorkerIn, WorkerOut } from './worker';

export class CancelledError extends Error {
  constructor() {
    super('Cancelado.');
  }
}

type Pending = { id: number; resolve: (v: unknown) => void; reject: (e: Error) => void; onProgress?: (p: Progress) => void };

export class EngineClient {
  private worker: Worker | null = null;
  private pending: Pending | null = null;
  private seq = 0;

  private ensure(): Worker {
    if (this.worker) return this.worker;
    const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e: MessageEvent<WorkerOut>) => {
      const msg = e.data;
      const p = this.pending;
      if (!p || msg.id !== p.id) return;
      if (msg.type === 'progress') p.onProgress?.({ text: msg.text, solutions: msg.solutions });
      else {
        this.pending = null;
        if (msg.type === 'done') p.resolve(msg.result);
        else p.reject(new Error(msg.message));
      }
    };
    w.onerror = (e) => {
      e.preventDefault();
      const p = this.pending;
      this.pending = null;
      this.reset();
      p?.reject(new Error(e.message || 'El cálculo falló.'));
    };
    this.worker = w;
    return w;
  }

  private reset() {
    this.worker?.terminate();
    this.worker = null;
  }

  /** Corre una tarea. Si había otra en curso, la cancela. */
  run<T>(request: WorkerIn['request'], onProgress?: (p: Progress) => void): Promise<T> {
    this.cancel();
    const id = ++this.seq;
    return new Promise<T>((resolve, reject) => {
      this.pending = { id, resolve: resolve as (v: unknown) => void, reject, onProgress };
      this.ensure().postMessage({ id, request } satisfies WorkerIn);
    });
  }

  get busy() {
    return this.pending !== null;
  }

  cancel() {
    const p = this.pending;
    if (!p) return;
    this.pending = null;
    this.reset();
    p.reject(new CancelledError());
  }

  dispose() {
    this.cancel();
    this.reset();
  }
}

export interface TaskState<T> {
  running: boolean;
  progress: Progress | null;
  result: T | null;
  error: string | null;
  startedAt: number | null;
}

/** Hook de una tarea del worker: devuelve su estado, `run` y `cancel`. */
export function useEngineTask<T>() {
  const client = useRef<EngineClient | null>(null);
  const [state, setState] = useState<TaskState<T>>({ running: false, progress: null, result: null, error: null, startedAt: null });

  useEffect(() => {
    const c = new EngineClient();
    client.current = c;
    return () => c.dispose();
  }, []);

  const run = useCallback(async (request: AnalyzeRequest | GenerateRequest): Promise<T | null> => {
    const c = client.current;
    if (!c) return null;
    setState((s) => ({ ...s, running: true, progress: null, error: null, startedAt: Date.now() }));
    try {
      const result = await c.run<T>(request, (progress) => setState((s) => ({ ...s, progress })));
      setState({ running: false, progress: null, result, error: null, startedAt: null });
      return result;
    } catch (e) {
      if (e instanceof CancelledError) {
        // Si la canceló otra corrida, esa ya marcó running; si la canceló el usuario, se apaga acá.
        if (!c.busy) setState((s) => ({ ...s, running: false, progress: null, startedAt: null }));
        return null;
      }
      setState((s) => ({ ...s, running: false, progress: null, error: (e as Error).message, startedAt: null }));
      return null;
    }
  }, []);

  const cancel = useCallback(() => client.current?.cancel(), []);
  const clear = useCallback(() => setState({ running: false, progress: null, result: null, error: null, startedAt: null }), []);

  return { ...state, run, cancel, clear };
}

export type AnalysisTask = ReturnType<typeof useEngineTask<Analysis>>;
export type GenerateTask = ReturnType<typeof useEngineTask<GenerateResult>>;
