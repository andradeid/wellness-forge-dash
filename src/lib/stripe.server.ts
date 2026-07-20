import Stripe from "stripe";

/**
 * Cliente Stripe server-only. Nunca importar fora de handlers/servidor.
 * Usa fetch httpClient (compatível com Cloudflare Workers).
 */
export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY não configurada");
  return new Stripe(key, {
    apiVersion: "2024-06-20" as Stripe.LatestApiVersion,
    httpClient: Stripe.createFetchHttpClient(),
  });
}
