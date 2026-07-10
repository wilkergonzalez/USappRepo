import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const ENV_KEYS = {
  url: ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_URL'],
  anon: ['NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_ANON_KEY', 'EXPO_PUBLIC_SUPABASE_ANON_KEY'],
  service: ['SUPABASE_SERVICE_ROLE_KEY'],
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
const supabaseServiceRoleKey = resolveEnv(ENV_KEYS.service);

let browserClient: SupabaseClient | null = null;
let serverClient: SupabaseClient | null = null;

export function hasAdminSupabaseConfig() {
  return Boolean(supabaseUrl && supabaseAnonKey);
}

export function hasServiceRoleConfig() {
  return Boolean(supabaseUrl && supabaseServiceRoleKey);
}

export function getAdminBrowserClient() {
  if (!hasAdminSupabaseConfig()) {
    return null;
  }

  if (!browserClient && supabaseUrl && supabaseAnonKey) {
    browserClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: false,
        persistSession: true,
      },
    });
  }

  return browserClient;
}

export function getAdminServerClient() {
  if (!hasServiceRoleConfig()) {
    return null;
  }

  if (!serverClient && supabaseUrl && supabaseServiceRoleKey) {
    serverClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });
  }

  return serverClient;
}

export function getAdminUserClient(accessToken: string) {
  if (!hasAdminSupabaseConfig() || !supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}

export async function getAuthenticatedUserFromRequest(request: Request) {
  const browserClient = getAdminBrowserClient();
  if (!browserClient) {
    return null;
  }

  const authorization = request.headers.get('authorization') ?? request.headers.get('Authorization');
  const token = authorization?.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : null;
  if (!token) {
    return null;
  }

  const { data, error } = await browserClient.auth.getUser(token);
  if (error) {
    throw error;
  }

  return data.user ?? null;
}
