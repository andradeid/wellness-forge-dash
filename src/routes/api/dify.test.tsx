import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { getDifyConfig, invalidateDifyConfigCache } from "@/lib/dify-config.server";

async function authSuperAdmin(request: Request): Promise<string | null> {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const token = auth.slice(7);
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false } },
  );
  const { data: claimsData, error } = await supabase.auth.getClaims(token);
  if (error || !claimsData?.claims?.sub) return null;
  const userId = claimsData.claims.sub;

  const admin = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const { data: roles } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "super_admin")
    .maybeSingle();

  return roles ? userId : null;
}

export const Route = createFileRoute("/api/dify/test")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const userId = await authSuperAdmin(request);
        if (!userId) return new Response("Forbidden", { status: 403 });

        // Always re-read fresh config so the test reflects what's saved.
        invalidateDifyConfigCache();
        const { baseUrl, apiKey } = await getDifyConfig(true);
        if (!apiKey) {
          return Response.json(
            { ok: false, error: "DIFY_API_KEY não configurada." },
            { status: 200 },
          );
        }

        try {
          const ctrl = new AbortController();
          const timeout = setTimeout(() => ctrl.abort(), 8000);
          const res = await fetch(`${baseUrl}/parameters?user=lumma-healthcheck`, {
            method: "GET",
            headers: { Authorization: `Bearer ${apiKey}` },
            signal: ctrl.signal,
          });
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
      },
    },
  },
});
