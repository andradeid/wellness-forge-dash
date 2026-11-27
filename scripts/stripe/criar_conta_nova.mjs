#!/usr/bin/env node
/**
 * Prepara a conta Stripe nova da Lumma (Centro de Ensino Em Nutrição APP) com os mesmos
 * produtos e preços de hoje, o portal do cliente e o webhook. Pode rodar quantas vezes
 * quiser: reaproveita o que já existe pelo lookup_key / URL.
 *
 * Uso (a chave NUNCA vai para chat nem para o git):
 *   STRIPE_KEY=sk_test_... node scripts/stripe/criar_conta_nova.mjs            # modo de teste
 *   STRIPE_KEY=sk_live_... WEBHOOK_URL=https://lumma.ia.br/api/public/stripe-webhook node scripts/stripe/criar_conta_nova.mjs
 *
 * Saída: JSON com os ids novos + o SQL do dia da troca (passo 8 do plano de migração).
 * O segredo do webhook (whsec_...) só aparece na primeira criação: vai direto para o .env do servidor.
 */
import Stripe from "stripe";

const KEY = process.env.STRIPE_KEY;
if (!KEY || !/^sk_(test|live)_/.test(KEY)) {
  console.error("Defina STRIPE_KEY=sk_test_... ou sk_live_...");
  process.exit(1);
}
const LIVE = KEY.startsWith("sk_live_");
const WEBHOOK_URL = process.env.WEBHOOK_URL || (LIVE ? "https://lumma.ia.br/api/public/stripe-webhook" : "https://beta.lumma.ia.br/api/public/stripe-webhook");
const RETURN_URL = LIVE ? "https://lumma.ia.br/app/planos" : "https://beta.lumma.ia.br/app/planos";
const stripe = new Stripe(KEY);

// Igual ao banco da Lumma (subscription_plans / credit_packs) em 27/11/2026.
const PLANS = [
  { slug: "starter", name: "Lumma Starter", desc: "Para quem atende até 30 pacientes por mês · 1.000 créditos/mês", monthly: 7500, yearly: 59700 },
  { slug: "pro", name: "Lumma Pro Individual", desc: "Para quem atende até 90 pacientes por mês · 3.000 créditos/mês", monthly: 9900, yearly: 84700 },
];
const PACKS = [
  { slug: "avulso-150", name: "Lumma · 150 créditos avulsos", cents: 2990 },
  { slug: "avulso-600", name: "Lumma · 600 créditos avulsos", cents: 5990 },
  { slug: "avulso-2000", name: "Lumma · 2.000 créditos avulsos", cents: 11990 },
];
const EVENTS = [
  "checkout.session.completed", "customer.subscription.created", "customer.subscription.updated",
  "customer.subscription.deleted", "invoice.paid", "invoice.payment_succeeded", "invoice.payment_failed", "charge.refunded",
];

async function priceByLookup(lookup) {
  const r = await stripe.prices.list({ lookup_keys: [lookup], limit: 1, expand: ["data.product"] });
  return r.data[0] ?? null;
}

async function ensureProduct(key, name, description) {
  const found = await stripe.products.search({ query: `metadata['lumma_key']:'${key}'`, limit: 1 });
  if (found.data[0]) return found.data[0];
  return stripe.products.create({ name, description, metadata: { lumma_key: key } });
}

async function ensurePrice(lookup, productId, cents, recurring) {
  const p = await priceByLookup(lookup);
  if (p) {
    if (p.unit_amount !== cents) throw new Error(`Preço ${lookup} existe com outro valor (${p.unit_amount}); confira antes de seguir.`);
    return p;
  }
  return stripe.prices.create({
    product: productId, currency: "brl", unit_amount: cents, lookup_key: lookup,
    ...(recurring ? { recurring: { interval: recurring } } : {}),
    metadata: { lumma_key: lookup },
  });
}

const out = { modo: LIVE ? "live" : "test", planos: {}, pacotes: {} };

for (const pl of PLANS) {
  const prod = await ensureProduct(`plano_${pl.slug}`, pl.name, pl.desc);
  const m = await ensurePrice(`lumma_${pl.slug}_mensal`, prod.id, pl.monthly, "month");
  const y = await ensurePrice(`lumma_${pl.slug}_anual`, prod.id, pl.yearly, "year");
  out.planos[pl.slug] = { product: prod.id, mensal: m.id, anual: y.id };
}
for (const pk of PACKS) {
  const prod = await ensureProduct(`pacote_${pk.slug}`, pk.name, "Créditos avulsos da Lumma. Não expiram.");
  const p = await ensurePrice(`lumma_${pk.slug}`, prod.id, pk.cents, null);
  out.pacotes[pk.slug] = { product: prod.id, price: p.id };
}

// Portal do cliente: trocar cartão, ver faturas, cancelar no fim do período, trocar entre os planos.
const products = PLANS.map((pl) => ({ product: out.planos[pl.slug].product, prices: [out.planos[pl.slug].mensal, out.planos[pl.slug].anual] }));
const portals = await stripe.billingPortal.configurations.list({ limit: 10 });
const portalParams = {
  business_profile: { headline: "Lumma · gerencie sua assinatura" },
  default_return_url: RETURN_URL,
  features: {
    payment_method_update: { enabled: true },
    invoice_history: { enabled: true },
    customer_update: { enabled: true, allowed_updates: ["email", "tax_id"] },
    subscription_cancel: { enabled: true, mode: "at_period_end", cancellation_reason: { enabled: true, options: ["too_expensive", "unused", "missing_features", "switched_service", "other"] } },
    subscription_update: { enabled: true, default_allowed_updates: ["price"], proration_behavior: "create_prorations", products },
  },
};
const mine = portals.data.find((c) => c.metadata?.lumma === "1");
const portal = mine
  ? await stripe.billingPortal.configurations.update(mine.id, portalParams)
  : await stripe.billingPortal.configurations.create({ ...portalParams, metadata: { lumma: "1" } });
out.portal = portal.id;

// Webhook
const hooks = await stripe.webhookEndpoints.list({ limit: 50 });
let hook = hooks.data.find((h) => h.url === WEBHOOK_URL);
if (hook) {
  hook = await stripe.webhookEndpoints.update(hook.id, { enabled_events: EVENTS });
  out.webhook = { id: hook.id, url: WEBHOOK_URL, segredo: "(já existia: o whsec_ está no painel > Desenvolvedores > Webhooks)" };
} else {
  hook = await stripe.webhookEndpoints.create({ url: WEBHOOK_URL, enabled_events: EVENTS, description: "Lumma" });
  out.webhook = { id: hook.id, url: WEBHOOK_URL, segredo: hook.secret };
}

// SQL do dia da troca: preços novos viram os principais; os atuais (conta Etria) entram nos extras.
const q = (s) => `'${s}'`;
const sql = [];
for (const pl of PLANS) {
  const n = out.planos[pl.slug];
  sql.push(
    `update subscription_plans set ` +
    `stripe_extra_price_ids = (select array(select distinct unnest(stripe_extra_price_ids || array[stripe_price_monthly_id, stripe_price_yearly_id]) )), ` +
    `stripe_extra_product_ids = (select array(select distinct unnest(stripe_extra_product_ids || array[stripe_product_id]))), ` +
    `stripe_product_id = ${q(n.product)}, stripe_price_monthly_id = ${q(n.mensal)}, stripe_price_yearly_id = ${q(n.anual)}, updated_at = now() ` +
    `where slug = ${q(pl.slug)};`,
  );
}
for (const pk of PACKS) {
  const n = out.pacotes[pk.slug];
  sql.push(`update credit_packs set stripe_product_id = ${q(n.product)}, stripe_price_id = ${q(n.price)}, updated_at = now() where slug = ${q(pk.slug)};`);
}
out.sql_dia_da_troca = sql.join("\n");
console.log(JSON.stringify(out, null, 2));
