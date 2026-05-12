import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface DifyConfig {
  baseUrl: string;
  apiKey: string;
}

interface CacheEntry {
  data: DifyConfig;
  expires: number;
}

let cache: CacheEntry | null = null;
const TTL_MS = 60_000; // 60s

const DEFAULT_BASE_URL = "https://api.dify.ai/v1";

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/$/, "");
}

function makeUserClient(token: string): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Variáveis SUPABASE_URL/SUPABASE_PUBLISHABLE_KEY ausentes no servidor.",
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

function makeServiceClient(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function applyIntegrationRows(client: SupabaseClient, current: DifyConfig) {
  const { data, error } = await client
    .from("integrations")
    .select("key, value")
    .in("key", ["dify_endpoint", "dify_api_key"]);

  if (error) throw error;

  const next = { ...current };
  for (const row of (data ?? []) as Array<{ key: string; value: string | null }>) {
    if (row.key === "dify_endpoint" && row.value) next.baseUrl = row.value;
    if (row.key === "dify_api_key" && row.value) next.apiKey = row.value;
  }
  return next;
}

/**
 * Loads Dify config from the `integrations` table using the caller's
 * authenticated Supabase client (RLS only allows super_admin to read).
 * Cached for 60s. Falls back to process.env if a value is missing.
 */
export async function getDifyConfig(
  userToken: string,
  force = false,
): Promise<DifyConfig> {
  const now = Date.now();
  if (!force && cache && cache.expires > now) return cache.data;

  let config: DifyConfig = {
    baseUrl: process.env.DIFY_BASE_URL || DEFAULT_BASE_URL,
    apiKey: "",
  };

  const serviceClient = makeServiceClient();
  console.log("[dify-config] service client available:", !!serviceClient);

  if (serviceClient) {
    try {
      config = await applyIntegrationRows(serviceClient, config);
      console.log("[dify-config] service read ok. apiKey len:", config.apiKey.length);
    } catch (e) {
      console.error("[dify-config] service read failed:", e);
    }
  }

  // Fallback: try user client if service client missing or returned empty
  if (!config.apiKey) {
    try {
      config = await applyIntegrationRows(makeUserClient(userToken), config);
      console.log("[dify-config] user-client read. apiKey len:", config.apiKey.length);
    } catch (e) {
      console.error("[dify-config] user-client read failed:", e);
    }
  }

  // Final fallback: env secret
  if (!config.apiKey && process.env.DIFY_API_KEY) {
    config.apiKey = process.env.DIFY_API_KEY;
    console.log("[dify-config] using env DIFY_API_KEY fallback");
  }

  config = { ...config, baseUrl: normalizeBaseUrl(config.baseUrl) };
  cache = { data: config, expires: now + TTL_MS };
  return config;
}

export function invalidateDifyConfigCache() {
  cache = null;
}
