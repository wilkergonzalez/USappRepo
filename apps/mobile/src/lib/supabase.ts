import { createClient, type SupabaseClient, type Session } from '@supabase/supabase-js';

const ENV_KEYS = {
  url: ['EXPO_PUBLIC_SUPABASE_URL', 'SUPABASE_URL'],
  anon: ['EXPO_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_ANON_KEY'],
} as const;

function resolveEnv(keys: readonly string[]) {
  for (const key of keys) {
    const value = process.env[key];
    if (value && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

const supabaseUrl = resolveEnv(ENV_KEYS.url);
const supabaseAnonKey = resolveEnv(ENV_KEYS.anon);

let cachedClient: SupabaseClient | null = null;

export function hasSupabaseConfig() {
  return Boolean(supabaseUrl && supabaseAnonKey);
}

export function getSupabaseClient() {
  if (!hasSupabaseConfig()) {
    return null;
  }

  if (!cachedClient && supabaseUrl && supabaseAnonKey) {
    cachedClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: false,
        persistSession: true,
      },
    });
  }

  return cachedClient;
}

export async function getCurrentSession(): Promise<Session | null> {
  const client = getSupabaseClient();
  if (!client) {
    return null;
  }

  const { data, error } = await client.auth.getSession();
  if (error) {
    throw error;
  }

  return data.session;
}
