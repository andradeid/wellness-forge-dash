import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { getDifyConfig, invalidateDifyConfigCache } from "@/lib/dify-config.server";

async function authSuperAdmin(
  request: Request,
): Promise<{ userId: string; token: string } | null> {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const token = auth.slice(7);

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: claimsData, error: claimsErr } = await supabase.auth.getClaims(token);
  if (claimsErr || !claimsData?.claims?.sub) return null;
  const userId = claimsData.claims.sub;

  // RLS on user_roles allows the user to read their own roles
  const { data: roles } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "super_admin")
    .maybeSingle();

  return roles ? { userId, token } : null;
}

export const Route = createFileRoute("/api/dify/test")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const auth = await authSuperAdmin(request);
          if (!auth) return new Response("Forbidden", { status: 403 });

          invalidateDifyConfigCache();
          const { baseUrl, apiKey } = await getDifyConfig(auth.token, true);
          if (!apiKey) {
            return Response.json({
              ok: false,
              error: "DIFY_API_KEY não configurada.",
            });
          }

          try {
            const ctrl = new AbortController();
            const timeout = setTimeout(() => ctrl.abort(), 8000);
            const res = await fetch(
              `${baseUrl}/parameters?user=lumma-healthcheck`,
              {
                method: "GET",
                headers: { Authorization: `Bearer ${apiKey}` },
                signal: ctrl.signal,
              },
            );
            clearTimeout(timeout);

            if (!res.ok) {
              const text = await res.text().catch(() => "");
              return Response.json({
                ok: false,
                status: res.status,
                error: text.slice(0, 300) || `HTTP ${res.status}`,
                baseUrl,
              });
            }

            return Response.json({ ok: true, status: res.status, baseUrl });
          } catch (e: unknown) {
            const message = e instanceof Error ? e.message : String(e);
            return Response.json({ ok: false, error: message, baseUrl });
          }
        } catch (e: unknown) {
          const message = e instanceof Error ? e.message : String(e);
          console.error("[dify/test] handler error:", message);
          return Response.json(
            { ok: false, error: `Erro interno: ${message}` },
            { status: 200 },
          );
        }
      },
    },
  },
});
