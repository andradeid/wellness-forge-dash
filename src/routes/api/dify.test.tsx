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

            const rawText = await res.text().catch(() => "");
            let parsed: any = null;
            try { parsed = rawText ? JSON.parse(rawText) : null; } catch { /* ignore */ }

            if (!res.ok) {
              const code = parsed?.code as string | undefined;
              const message = (parsed?.message as string | undefined) ?? rawText;

              // Workspace arquivado
              if (
                res.status === 403 &&
                (/archived/i.test(message ?? "") || code === "forbidden")
              ) {
                return Response.json({
                  ok: false,
                  status: res.status,
                  workspaceActive: false,
                  reason: "workspace_archived",
                  error:
                    "O workspace dessa API Key está arquivado no Dify. Reative-o ou gere uma nova chave em um workspace ativo.",
                  baseUrl,
                });
              }

              // Chave inválida
              if (res.status === 401 || code === "unauthorized" || code === "invalid_api_key") {
                return Response.json({
                  ok: false,
                  status: res.status,
                  reason: "invalid_api_key",
                  error: "API Key inválida ou revogada. Confirme a chave do app no Dify.",
                  baseUrl,
                });
              }

              // App não encontrado
              if (res.status === 404) {
                return Response.json({
                  ok: false,
                  status: res.status,
                  reason: "app_not_found",
                  error:
                    "App não encontrado nesse endpoint. Verifique se a DIFY_BASE_URL aponta para a instância correta.",
                  baseUrl,
                });
              }

              return Response.json({
                ok: false,
                status: res.status,
                reason: "http_error",
                error: (message ?? "").slice(0, 300) || `HTTP ${res.status}`,
                baseUrl,
              });
            }

            // 2xx — workspace ativo e chave válida
            return Response.json({
              ok: true,
              status: res.status,
              workspaceActive: true,
              baseUrl,
              appName:
                (parsed?.user_input_form && "ok") ||
                parsed?.opening_statement ||
                undefined,
            });
          } catch (e: unknown) {
            const message = e instanceof Error ? e.message : String(e);
            return Response.json({
              ok: false,
              reason: "network_error",
              error: `Não foi possível alcançar o Dify: ${message}`,
              baseUrl,
            });
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
