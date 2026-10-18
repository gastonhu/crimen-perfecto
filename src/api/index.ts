import { localBackend } from './local';
import { supabaseBackend } from './supabase';
import type { Backend } from './types';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const backend: Backend = url && key ? supabaseBackend(url, key) : localBackend;
export * from './types';
