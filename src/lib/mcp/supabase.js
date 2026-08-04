/**
 * Fábrica de clientes Supabase usada pelas tools do MCP.
 *
 * Regras:
 * - Nenhuma leitura de env em escopo de módulo (o entry do MCP é avaliado em
 *   build-time e em cold-start do Worker, quando os secrets ainda não existem).
 * - Todas as leituras de dados de curadoria passam pelo token verificado do
 *   chamador, para que a RLS do Supabase seja aplicada como aquele usuário.
 */
import { createClient } from "@supabase/supabase-js";
function runtimeEnv(name) {
    const runtime = globalThis;
    return runtime.Deno?.env?.get?.(name) ?? runtime.process?.env?.[name];
}
function configuredEnv(names) {
    for (const name of names) {
        const value = runtimeEnv(name)?.trim();
        if (value)
            return value;
    }
    return undefined;
}
function supabaseProjectUrl() {
    const url = configuredEnv(["SUPABASE_URL", "VITE_SUPABASE_URL"]);
    if (!url)
        throw new Error("SUPABASE_URL (ou VITE_SUPABASE_URL) não está configurada.");
    return url;
}
function supabasePublishableKey() {
    const key = configuredEnv([
        "SUPABASE_PUBLISHABLE_KEY",
        "VITE_SUPABASE_PUBLISHABLE_KEY",
        "SUPABASE_ANON_KEY",
        "VITE_SUPABASE_ANON_KEY",
    ]);
    if (!key)
        throw new Error("SUPABASE_PUBLISHABLE_KEY (ou SUPABASE_ANON_KEY) não está configurada.");
    return key;
}
/** Cliente que age como o usuário autenticado no MCP — RLS aplicada. */
export function supabaseForUser(ctx) {
    return createClient(supabaseProjectUrl(), supabasePublishableKey(), {
        global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
        auth: { persistSession: false, autoRefreshToken: false },
    });
}
