import { createClient } from '@supabase/supabase-js';

// Online-only mode – reads from Vite environment variables set in .env
const isMeta = typeof import.meta !== 'undefined' && import.meta.env;

const supabaseUrl = isMeta ? import.meta.env.VITE_SUPABASE_URL : process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = isMeta ? import.meta.env.VITE_SUPABASE_ANON_KEY : process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    '[Supabase] VITE_SUPABASE_URL and/or VITE_SUPABASE_ANON_KEY are not set. ' +
    'Please add them to your .env file. The portal will not function without a database connection.'
  );
}

export const isSupabaseConfigured = !!supabaseUrl && !!supabaseAnonKey;

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!)
  : null;

if (isSupabaseConfigured) {
  console.log(`[Supabase] Online registry linked: ${supabaseUrl}`);
}
