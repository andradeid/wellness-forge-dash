import Stripe from "stripe";

/**
 * Cliente Stripe server-only. Nunca importar fora de handlers/servidor.
 * Usa fetch httpClient (compatível com Cloudflare Workers).
 *
 * Duas contas Stripe ao mesmo tempo (troca de conta):
 *  - "principal": STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET — recebe as compras novas.
 *  - "antiga" (opcional): STRIPE_SECRET_KEY_ANTIGA + STRIPE_WEBHOOK_SECRET_ANTIGA — continua mandando os
 *    avisos das assinaturas que já existiam nela (renovação, falha, cancelamento, estorno) e é onde a
 *    cliente dessas assinaturas gerencia o cartão. Sem as variáveis da antiga, tudo funciona como antes.
 */
export type StripeAccountName = "principal" | "antiga";

export interface StripeAccount {
  name: StripeAccountName;
  secretKey: string;
  webhookSecret: string | null;
}

const API_VERSION = "2024-06-20" as Stripe.LatestApiVersion;
const clients = new Map<string, Stripe>();

function clientFor(key: string): Stripe {
  let c = clients.get(key);
  if (!c) {
    c = new Stripe(key, { apiVersion: API_VERSION, httpClient: Stripe.createFetchHttpClient() });
    clients.set(key, c);
  }
  return c;
}

/** Contas configuradas, a principal primeiro. */
export function getStripeAccounts(env: Record<string, string | undefined> = process.env): StripeAccount[] {
  const out: StripeAccount[] = [];
  if (env.STRIPE_SECRET_KEY) {
    out.push({ name: "principal", secretKey: env.STRIPE_SECRET_KEY, webhookSecret: env.STRIPE_WEBHOOK_SECRET || null });
  }
  if (env.STRIPE_SECRET_KEY_ANTIGA && env.STRIPE_SECRET_KEY_ANTIGA !== env.STRIPE_SECRET_KEY) {
    out.push({ name: "antiga", secretKey: env.STRIPE_SECRET_KEY_ANTIGA, webhookSecret: env.STRIPE_WEBHOOK_SECRET_ANTIGA || null });
  }
  return out;
}

/** Cliente da conta pedida (padrão: principal, onde entram as compras novas). */
export function getStripe(account: StripeAccountName = "principal"): Stripe {
  const acc = getStripeAccounts().find((a) => a.name === account);
  if (!acc) {
    if (account === "principal") throw new Error("STRIPE_SECRET_KEY não configurada");
    throw new Error("Conta Stripe antiga não configurada (STRIPE_SECRET_KEY_ANTIGA)");
  }
  return clientFor(acc.secretKey);
}

export function hasOldStripeAccount(): boolean {
  return getStripeAccounts().some((a) => a.name === "antiga");
}

const isMissingCustomer = (err: any) => {
  const msg = String(err?.message ?? err ?? "");
  return /No such customer/i.test(msg) || /similar object exists in (test|live) mode/i.test(msg);
};

/** Em qual conta o cliente Stripe existe (principal primeiro); null se em nenhuma. */
export async function findCustomerAccount(customerId: string): Promise<StripeAccountName | null> {
  for (const acc of getStripeAccounts()) {
    try {
      const c = await clientFor(acc.secretKey).customers.retrieve(customerId);
      if (!(c as any)?.deleted) return acc.name;
    } catch (err: any) {
      if (!isMissingCustomer(err)) throw err;
    }
  }
  return null;
}

/**
 * Confere a assinatura do webhook com o segredo de cada conta configurada e devolve o evento junto com
 * o cliente Stripe da conta que mandou. null se nenhuma conta confere.
 */
export async function verifyStripeWebhook(
  rawBody: string,
  signature: string,
  accounts: StripeAccount[] = getStripeAccounts(),
): Promise<{ event: Stripe.Event; stripe: Stripe; account: StripeAccountName } | null> {
  const cryptoProvider = Stripe.createSubtleCryptoProvider(); // Cloudflare Workers exige SubtleCryptoProvider explícito
  for (const acc of accounts) {
    if (!acc.webhookSecret) continue;
    const stripe = clientFor(acc.secretKey);
    try {
      const event = await stripe.webhooks.constructEventAsync(rawBody, signature, acc.webhookSecret, undefined, cryptoProvider);
      return { event, stripe, account: acc.name };
    } catch {
      // tenta a próxima conta
    }
  }
  return null;
}
