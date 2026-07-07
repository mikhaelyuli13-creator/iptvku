import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const hasSupabase = !!(supabaseUrl && supabaseKey && supabaseUrl !== 'placeholder' && supabaseKey !== 'placeholder');

if (!hasSupabase) {
  console.warn('⚠️ Supabase credentials not found. Please check your .env.local file or platform settings. Defaulting to local data.');
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseKey || 'placeholder_key'
);
