import { createFileRoute } from "@tanstack/react-router";
import { authSuperAdmin } from "@/lib/admin-auth.server";
import { getDifyAgentConfig, invalidateDifyConfigCache } from "@/lib/dify-config.server";

export const Route = createFileRoute("/api/dify/agent-test")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const auth = await authSuperAdmin(request);
          if (!auth) return new Response("Forbidden", { status: 403 });

          let body: { agent_id?: string } = {};
          try {
            body = await request.json();
          } catch {
            /* ignore */
          }
          const agentId = (body.agent_id ?? "").trim();
          if (!agentId) {
            return Response.json({ ok: false, error: "agent_id obrigatório." });
          }

          invalidateDifyConfigCache();
          let config;
          try {
            config = await getDifyAgentConfig(agentId, auth.token, true);
          } catch (e: unknown) {
            const message = e instanceof Error ? e.message : String(e);
            return Response.json({ ok: false, error: message });
          }

          const ctrl = new AbortController();
          const timeout = setTimeout(() => ctrl.abort(), 5000);
          try {
            const res = await fetch(`${config.baseUrl}/info`, {
              method: "GET",
              headers: { Authorization: `Bearer ${config.apiKey}` },
              signal: ctrl.signal,
            });
            clearTimeout(timeout);

            const raw = await res.text().catch(() => "");
            let parsed: any = null;
            try {
              parsed = raw ? JSON.parse(raw) : null;
            } catch {
              /* ignore */
            }

            if (res.status === 200) {
              return Response.json({
                ok: true,
                app_name: parsed?.name ?? null,
                app_description: parsed?.description ?? null,
              });
            }
            if (res.status === 401) {
              return Response.json({
                ok: false,
                error: "Chave inválida ou sem permissão",
              });
            }
            return Response.json({
              ok: false,
              error: "Endpoint não encontrado. Verifique a URL base.",
            });
          } catch (e: unknown) {
            clearTimeout(timeout);
            const isAbort = e instanceof Error && e.name === "AbortError";
            if (isAbort) {
              return Response.json({
                ok: false,
                error: "Timeout — Dify não respondeu em 5 segundos",
              });
            }
            return Response.json({
              ok: false,
              error: "Endpoint não encontrado. Verifique a URL base.",
            });
          }
        } catch (e: unknown) {
          const message = e instanceof Error ? e.message : String(e);
          return Response.json({ ok: false, error: `Erro interno: ${message}` });
        }
      },
    },
  },
});
