// Web Worker del editor: corre la generación de pistas y el análisis sin congelar la UI.
// Protocolo: recibe { id, request } y responde { id, type: 'progress' | 'done' | 'error', ... }.
import { analyze, generate, type TaskRequest } from './tasks';

export type WorkerIn = { id: number; request: TaskRequest };
export type WorkerOut =
  | { id: number; type: 'progress'; text: string; solutions?: number }
  | { id: number; type: 'done'; result: unknown }
  | { id: number; type: 'error'; message: string };

const post = (msg: WorkerOut) => (self as unknown as Worker).postMessage(msg);

self.onmessage = (e: MessageEvent<WorkerIn>) => {
  const { id, request } = e.data;
  try {
    const result =
      request.kind === 'analyze' ? analyze(request) : generate(request, (p) => post({ id, type: 'progress', ...p }));
    post({ id, type: 'done', result });
  } catch (err) {
    post({ id, type: 'error', message: (err as Error).message });
  }
};
