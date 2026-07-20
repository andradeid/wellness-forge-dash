import { createFileRoute } from "@tanstack/react-router";
import { handleStripeWebhook } from "./stripe-webhook";

/**
 * Webhook público do Stripe — endpoint BETA (ambiente Lovable / testes).
 * URL: /api/public/stripe-webhook-beta
 *
 * Usa STRIPE_WEBHOOK_SECRET_BETA (secret separada do endpoint de produção).
 * Aponte aqui apenas o endpoint de teste do Stripe (modo test) ou um endpoint
 * secundário. O endpoint de produção continua em /api/public/stripe-webhook
 * e usa STRIPE_WEBHOOK_SECRET.
 */
export const Route = createFileRoute("/api/public/stripe-webhook-beta")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          return await handleStripeWebhook(request, process.env.STRIPE_WEBHOOK_SECRET_BETA);
        } catch (err: any) {
          console.error("[stripe-webhook-beta] fatal error:", err?.message, err);
          return new Response(`Webhook fatal error: ${err?.message ?? "erro desconhecido"}`, { status: 500 });
        }
      },
    },
  },
});
