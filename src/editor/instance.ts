// Backend que usa el editor: con Supabase configurado, autores reales y casos en la base; si no, modo local.
import type { EditorBackend } from './backend';
import { createLocalBackend } from './localBackend';
import { createRemoteBackend } from './remoteBackend';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const editorBackend: EditorBackend = url && key ? createRemoteBackend(url, key) : createLocalBackend();
