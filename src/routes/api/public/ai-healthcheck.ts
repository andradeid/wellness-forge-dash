import { createFileRoute } from "@tanstack/react-router";

/**
 * Teste periódico da IA durante a manutenção automática (trava de crédito).
 * Chamado pelo pg_cron (job ai-maintenance-probe) a cada 3 min, e só enquanto
 * a manutenção estiver ligada pela trava. Autenticação: header `apikey` com a
 * chave pública do projeto (mesmo padrão do job de e-mails de vencimento).
 */
export const Route = createFileRoute("/api/public/ai-healthcheck")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const provided = request.headers.get("apikey") ?? "";
        const accepted = [process.env["SUPABASE_ANON_KEY"], process.env["SUPABASE_PUBLISHABLE_KEY"]].filter(
          (v): v is string => Boolean(v),
        );
        if (!provided || !accepted.includes(provided)) {
          return new Response("Unauthorized", { status: 401 });
        }
        const { probeAndReleaseAiMaintenance } = await import("@/lib/ai-maintenance.server");
        const result = await probeAndReleaseAiMaintenance();
        return Response.json(result);
      },
    },
  },
});
