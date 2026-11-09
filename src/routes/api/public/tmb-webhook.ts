import { createFileRoute } from "@tanstack/react-router";
import { handleTmbWebhook } from "@/lib/tmb-webhook.server";

/** Webhook de Vendas da TMB. Lógica e documentação em src/lib/tmb-webhook.server.ts. */
export const Route = createFileRoute("/api/public/tmb-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          return await handleTmbWebhook(request);
        } catch (err: any) {
          console.error("[tmb-webhook] fatal:", err?.message, err);
          return new Response(`Fatal: ${err?.message ?? "erro"}`, { status: 500 });
        }
      },
    },
  },
});

