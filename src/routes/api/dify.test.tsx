import { createFileRoute } from "@tanstack/react-router";
import { authSuperAdmin } from "@/lib/admin-auth.server";
import { getDifyConfig, invalidateDifyConfigCache } from "@/lib/dify-config.server";

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
