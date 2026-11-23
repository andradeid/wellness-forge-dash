import { createFileRoute } from "@tanstack/react-router";

/**
 * Teste periódico da base de conhecimento (reranqueador Cohere) — ver
 * src/lib/rag-health.server.ts. Chamado pelo pg_cron (job rag-healthcheck) a
 * cada 30 min. Autenticação: header `apikey` com a chave pública do projeto
 * (mesmo padrão do ai-healthcheck).
 */
export const Route = createFileRoute("/api/public/rag-healthcheck")({
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
        const { checkRagHealth } = await import("@/lib/rag-health.server");
        return Response.json(await checkRagHealth());
      },
    },
  },
});
