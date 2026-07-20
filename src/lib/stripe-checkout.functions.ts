import { createServerFn } from "@tanstack/react-start";
import { getRequestHost, getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Base URL a partir do request (para success/cancel/return URLs). */
function getOrigin(): string {
  const forwardedProto = getRequestHeader("x-forwarded-proto");
  const host = getRequestHost();
  const proto = forwardedProto ?? (host.includes("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/**
 * Cria uma sessão de Checkout do Stripe para ASSINATURA (Starter/Pro, mensal/anual).
 * Retorna { url } — o frontend redireciona pra lá.
 *
 * Trial de 20 créditos é liberado no webhook após `checkout.session.completed`
 * (o cadastro exige cartão → assinatura criada aqui já com trial_period_days).
 */
export const createSubscriptionCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      planSlug: z.enum(["starter", "pro"]),
      cycle: z.enum(["monthly", "yearly"]),
      trialDays: z.number().int().min(0).max(30).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { getStripe } = await import("./stripe.server");
    const stripe = getStripe();

    // 1) Carrega plano + price_id do Stripe
    const { data: plan, error: planErr } = await context.supabase
      .from("subscription_plans" as any)
      .select("id, slug, name, stripe_price_monthly_id, stripe_price_yearly_id")
      .eq("slug", data.planSlug)
      .eq("is_active", true)
      .maybeSingle();
    if (planErr) throw new Error(planErr.message);
    if (!plan) throw new Error("Plano não encontrado");

    const priceId =
      data.cycle === "monthly"
        ? (plan as any).stripe_price_monthly_id
        : (plan as any).stripe_price_yearly_id;
    if (!priceId) {
      throw new Response(
        `Plano ${data.planSlug} não tem price_id Stripe para ciclo ${data.cycle}`,
        { status: 400 },
      );
    }

    // 2) Recupera / cria stripe_customer_id
    const { data: sub } = await context.supabase
      .from("subscriptions" as any)
      .select("stripe_customer_id")
      .eq("user_id", context.userId)
      .maybeSingle();

    let customerId = (sub as any)?.stripe_customer_id as string | null;
    if (!customerId) {
      const { data: profile } = await context.supabase
        .from("profiles" as any)
        .select("email, full_name")
        .eq("id", context.userId)
        .maybeSingle();
      const customer = await stripe.customers.create({
        email: (profile as any)?.email ?? undefined,
        name: (profile as any)?.full_name ?? undefined,
        metadata: { user_id: context.userId },
      });
      customerId = customer.id;
      await context.supabase
        .from("subscriptions" as any)
        .upsert(
          { user_id: context.userId, stripe_customer_id: customerId },
          { onConflict: "user_id" },
        );
    }

    // 3) Cria Checkout Session
    const origin = getOrigin();
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      payment_method_collection: "always",
      allow_promotion_codes: true,
      subscription_data: {
        trial_period_days: data.trialDays,
        metadata: {
          user_id: context.userId,
          plan_slug: data.planSlug,
          billing_cycle: data.cycle,
        },
      },
      success_url: `${origin}/app/planos?stripe=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/app/planos?stripe=cancel`,
      metadata: {
        user_id: context.userId,
        plan_slug: data.planSlug,
        billing_cycle: data.cycle,
        kind: "subscription",
      },
    });

    return { url: session.url, sessionId: session.id };
  });

/**
 * Cria uma sessão de Checkout do Stripe para PACOTE avulso (150/600/2000).
 * Modo `payment` (one-time). Créditos são adicionados no webhook.
 */
export const createPackCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      packSlug: z.string().min(1).max(80),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { getStripe } = await import("./stripe.server");
    const stripe = getStripe();

    const { data: pack, error: packErr } = await context.supabase
      .from("credit_packs" as any)
      .select("id, slug, name, credits, stripe_price_id")
      .eq("slug", data.packSlug)
      .eq("is_active", true)
      .maybeSingle();
    if (packErr) throw new Error(packErr.message);
    if (!pack) throw new Error("Pacote não encontrado");

    const priceId = (pack as any).stripe_price_id as string | null;
    if (!priceId) {
      throw new Response(
        `Pacote ${data.packSlug} não tem price_id Stripe configurado`,
        { status: 400 },
      );
    }

    // Recupera / cria customer (mesma lógica da assinatura)
    const { data: sub } = await context.supabase
      .from("subscriptions" as any)
      .select("stripe_customer_id")
      .eq("user_id", context.userId)
      .maybeSingle();

    let customerId = (sub as any)?.stripe_customer_id as string | null;
    if (!customerId) {
      const { data: profile } = await context.supabase
        .from("profiles" as any)
        .select("email, full_name")
        .eq("id", context.userId)
        .maybeSingle();
      const customer = await stripe.customers.create({
        email: (profile as any)?.email ?? undefined,
        name: (profile as any)?.full_name ?? undefined,
        metadata: { user_id: context.userId },
      });
      customerId = customer.id;
      await context.supabase
        .from("subscriptions" as any)
        .upsert(
          { user_id: context.userId, stripe_customer_id: customerId },
          { onConflict: "user_id" },
        );
    }

    const origin = getOrigin();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      allow_promotion_codes: true,
      payment_intent_data: {
        metadata: {
          user_id: context.userId,
          pack_slug: data.packSlug,
          credits: String((pack as any).credits),
        },
      },
      success_url: `${origin}/app/planos?stripe=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/app/planos?stripe=cancel`,
      metadata: {
        user_id: context.userId,
        pack_slug: data.packSlug,
        credits: String((pack as any).credits),
        kind: "pack",
      },
    });

    return { url: session.url, sessionId: session.id };
  });

/**
 * Abre o Customer Portal do Stripe para o usuário gerenciar assinatura / cartão.
 */
export const createBillingPortalSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getStripe } = await import("./stripe.server");
    const stripe = getStripe();

    const { data: sub } = await context.supabase
      .from("subscriptions" as any)
      .select("stripe_customer_id")
      .eq("user_id", context.userId)
      .maybeSingle();

    const customerId = (sub as any)?.stripe_customer_id as string | null;
    if (!customerId) {
      throw new Error("Sem cliente Stripe associado. Assine um plano ou compre um pacote primeiro.");
    }

    const origin = getOrigin();
    const portal = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}/app/planos`,
    });
    return { url: portal.url };
  });
