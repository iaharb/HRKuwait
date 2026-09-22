import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!url || !anon) {
  console.error('[Leave App] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing in .env');
}

export const supabase = createClient(url, anon);