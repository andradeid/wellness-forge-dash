import { createClient } from "@supabase/supabase-js";

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

function getAdminClient() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

/**
 * Loads Dify config from the `integrations` table (cached for 60s).
 * Falls back to process.env if a value is missing in the database.
 */
export async function getDifyConfig(force = false): Promise<DifyConfig> {
  const now = Date.now();
  if (!force && cache && cache.expires > now) return cache.data;

  let baseUrl = process.env.DIFY_BASE_URL || DEFAULT_BASE_URL;
  let apiKey = process.env.DIFY_API_KEY || "";

  try {
    const admin = getAdminClient();
    const { data } = await admin
      .from("integrations")
      .select("key, value")
      .in("key", ["dify_endpoint", "dify_api_key"]);

    if (data) {
      for (const row of data) {
        if (row.key === "dify_endpoint" && row.value) baseUrl = row.value;
        if (row.key === "dify_api_key" && row.value) apiKey = row.value;
      }
    }
  } catch (e) {
    console.error("[dify-config] failed to read integrations table:", e);
  }

  const config: DifyConfig = { baseUrl: normalizeBaseUrl(baseUrl), apiKey };
  cache = { data: config, expires: now + TTL_MS };
  return config;
}

export function invalidateDifyConfigCache() {
  cache = null;
}
