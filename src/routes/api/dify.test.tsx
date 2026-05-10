import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getDifyConfig, invalidateDifyConfigCache } from "@/lib/dify-config.server";

async function authSuperAdmin(request: Request): Promise<string | null> {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const token = auth.slice(7);

  const { data: userData, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !userData?.user?.id) return null;
  const userId = userData.user.id;

  const { data: roles } = await supabaseAdmin
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
        try {
          const userId = await authSuperAdmin(request);
          if (!userId) return new Response("Forbidden", { status: 403 });

          invalidateDifyConfigCache();
          const { baseUrl, apiKey } = await getDifyConfig(true);
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
