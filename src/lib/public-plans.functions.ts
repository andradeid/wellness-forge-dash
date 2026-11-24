/**
 * Página pública de planos (/planos): quem ainda não tem conta vê os planos e
 * assina direto. O checkout é "convidado" (sem login): o Stripe pede e-mail,
 * nome e telefone; o webhook já existente (checkout.session.completed →
 * syncSubscription → resolveOrInviteUserByCustomer) cria a conta pelo e-mail
 * e manda as boas-vindas com a senha temporária — o mesmo caminho dos
 * Payment Links. Quem já tem conta com o mesmo e-mail recebe a assinatura
 * na conta existente.
 */
import { createServerFn } from "@tanstack/react-start";
import { getRequestHost, getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";

function getOrigin(): string {
  const forwardedProto = getRequestHeader("x-forwarded-proto");
  const host = getRequestHost();
  const proto = forwardedProto ?? (host.includes("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export type PublicPlan = {
  slug: "starter" | "pro";
  name: string;
  description: string | null;
  monthlyCredits: number;
  priceMonthlyCents: number;
  priceYearlyCents: number | null;
};

/** Só campos públicos dos planos ativos pagos (lidos no servidor, sem depender de RLS). */
export const getPublicPlans = createServerFn({ method: "GET" }).handler(async (): Promise<PublicPlan[]> => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await (supabaseAdmin as any)
    .from("subscription_plans")
    .select("slug, name, description, monthly_credits, price_monthly_cents, price_yearly_cents, sort_order")
    .eq("is_active", true)
    .in("slug", ["starter", "pro"])
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((p: any) => ({
    slug: p.slug,
    name: p.name,
    description: p.description ?? null,
    monthlyCredits: p.monthly_credits ?? 0,
    priceMonthlyCents: p.price_monthly_cents ?? 0,
    priceYearlyCents: p.price_yearly_cents ?? null,
  }));
});

export const createPublicSubscriptionCheckout = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ planSlug: z.enum(["starter", "pro"]), cycle: z.enum(["monthly", "yearly"]) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: plan, error } = await (supabaseAdmin as any)
      .from("subscription_plans")
      .select("slug, stripe_price_monthly_id, stripe_price_yearly_id")
      .eq("slug", data.planSlug)
      .eq("is_active", true)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const priceId = data.cycle === "monthly" ? plan?.stripe_price_monthly_id : plan?.stripe_price_yearly_id;
    if (!priceId) throw new Error("Plano indisponível no momento. Fale com o suporte.");

    const { getStripe } = await import("./stripe.server");
    const stripe = getStripe();
    const origin = getOrigin();
    const meta = { plan_slug: data.planSlug, billing_cycle: data.cycle, source: "planos_publico" };
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      payment_method_collection: "always",
      allow_promotion_codes: true,
      billing_address_collection: "auto",
      phone_number_collection: { enabled: true },
      locale: "pt-BR",
      subscription_data: { metadata: meta },
      metadata: { ...meta, kind: "subscription" },
      success_url: `${origin}/planos/obrigado?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/planos?cancelado=1`,
    });
    return { url: session.url };
  });
