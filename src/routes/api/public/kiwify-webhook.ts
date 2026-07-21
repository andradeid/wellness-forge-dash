import { createFileRoute } from "@tanstack/react-router";

/**
 * Webhook público da Kiwify.
 * URL: /api/public/kiwify-webhook?token=<KIWIFY_WEBHOOK_TOKEN>
 *
 * Segurança: valida `token` (query ou body) contra KIWIFY_WEBHOOK_TOKEN.
 * Idempotência: reusa a tabela `stripe_webhook_events` com id "kiwify:<order_id>:<event>".
 *
 * Mapeamento de produtos Kiwify → planos Lumma:
 *   - a19b7600-851a-11f1-ac2c-dbf6162aa415 → Starter Anual
 *   - 59a89e30-851b-11f1-be44-db22545a0013 → Pro Anual
 *
 * Eventos tratados:
 *   - order_approved / compra_aprovada  → invite user + assinatura ativa + créditos + histórico
 *   - order_refunded / refunded         → cancela assinatura + registra refund
 *   - chargeback                        → cancela assinatura + registra chargeback
 *   - subscription_canceled / subscription_late → status atualizado
 *   - subscription_renewed              → estende current_period_end + refill de créditos
 */

const PRODUCT_MAP: Record<string, { slug: "starter" | "pro"; cycle: "yearly" }> = {
  "a19b7600-851a-11f1-ac2c-dbf6162aa415": { slug: "starter", cycle: "yearly" },
  "59a89e30-851b-11f1-be44-db22545a0013": { slug: "pro", cycle: "yearly" },
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
} as const;

export const Route = createFileRoute("/api/public/kiwify-webhook")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS_HEADERS }),
      POST: async ({ request }) => {
        try {
          return await handleKiwifyWebhook(request);
        } catch (err: any) {
          console.error("[kiwify-webhook] fatal:", err?.message, err);
          return new Response(`Fatal: ${err?.message ?? "erro"}`, { status: 500 });
        }
      },
    },
  },
});

async function handleKiwifyWebhook(request: Request) {
  const expectedToken = process.env.KIWIFY_WEBHOOK_TOKEN;
  if (!expectedToken) {
    return new Response("KIWIFY_WEBHOOK_TOKEN não configurado", { status: 500 });
  }

  // 1) Valida token (Kiwify manda como query param ?token=...)
  const url = new URL(request.url);
  const tokenQuery = url.searchParams.get("token");
  const tokenHeader = request.headers.get("x-kiwify-token");

  // Lê body (Kiwify manda JSON)
  const rawBody = await request.text();
  let payload: any = {};
  try {
    payload = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return new Response("Body JSON inválido", { status: 400 });
  }

  const tokenBody =
    payload?.webhook_token ?? payload?.token ?? payload?.Token ?? null;

  const suppliedToken = tokenQuery ?? tokenHeader ?? tokenBody;
  if (suppliedToken !== expectedToken) {
    console.warn("[kiwify-webhook] token inválido");
    return new Response("Unauthorized", { status: 401 });
  }

  // 2) Extrai evento + order_id
  const eventType: string =
    payload?.webhook_event_type ??
    payload?.event_type ??
    payload?.event ??
    "";
  const normalizedEvent = eventType.toLowerCase().trim();

  const orderId: string =
    payload?.order_id ??
    payload?.order?.id ??
    payload?.id ??
    "";

  if (!normalizedEvent) {
    console.warn("[kiwify-webhook] sem event type", payload);
    return new Response("Missing event type", { status: 400 });
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // 3) Idempotência — reusa stripe_webhook_events
  const eventKey = `kiwify:${orderId || "no-order"}:${normalizedEvent}:${payload?.updated_at ?? payload?.approved_date ?? Date.now()}`;
  const { data: existingEvent } = await supabaseAdmin
    .from("stripe_webhook_events" as any)
    .select("id")
    .eq("id", eventKey)
    .maybeSingle();

  if (existingEvent) {
    return new Response("duplicate", { status: 200 });
  }

  const { error: idemErr } = await supabaseAdmin
    .from("stripe_webhook_events" as any)
    .insert({ id: eventKey, type: `kiwify.${normalizedEvent}`, payload });

  if (idemErr && (idemErr as any).code === "23505") {
    return new Response("duplicate", { status: 200 });
  }
  if (idemErr) {
    console.error("[kiwify-webhook] idem insert erro:", idemErr);
    return new Response("Erro ao registrar evento", { status: 500 });
  }

  // 4) Roteia por tipo de evento
  try {
    if (
      normalizedEvent === "order_approved" ||
      normalizedEvent === "compra_aprovada" ||
      normalizedEvent === "purchase_approved" ||
      normalizedEvent === "subscription_renewed" ||
      normalizedEvent === "assinatura_renovada"
    ) {
      await handleOrderApproved(supabaseAdmin, payload, eventKey);
    } else if (
      normalizedEvent === "order_refunded" ||
      normalizedEvent === "refunded" ||
      normalizedEvent === "reembolso"
    ) {
      await handleRefundOrChargeback(supabaseAdmin, payload, eventKey, "refunded");
    } else if (normalizedEvent === "chargeback") {
      await handleRefundOrChargeback(supabaseAdmin, payload, eventKey, "chargeback");
    } else if (
      normalizedEvent === "subscription_canceled" ||
      normalizedEvent === "assinatura_cancelada"
    ) {
      await handleSubscriptionStatus(supabaseAdmin, payload, "canceled");
    } else if (
      normalizedEvent === "subscription_late" ||
      normalizedEvent === "assinatura_atrasada"
    ) {
      await handleSubscriptionStatus(supabaseAdmin, payload, "past_due");
    } else {
      console.log(`[kiwify-webhook] evento ignorado: ${normalizedEvent}`);
    }
  } catch (err: any) {
    console.error(`[kiwify-webhook] erro processando ${normalizedEvent}:`, err?.message, err);
    return new Response(`Erro: ${err?.message ?? "erro"}`, { status: 500 });
  }

  return new Response("ok", { status: 200, headers: CORS_HEADERS });
}

// --------------------------------------------------------------------
// Helpers de extração de payload
// --------------------------------------------------------------------

function extractProductId(payload: any): string | null {
  return (
    payload?.Product?.product_id ??
    payload?.product?.product_id ??
    payload?.product_id ??
    payload?.Product?.id ??
    payload?.product?.id ??
    null
  );
}

function extractCustomer(payload: any): { email: string; name: string | null; phone: string | null } | null {
  const c = payload?.Customer ?? payload?.customer ?? payload?.buyer ?? {};
  const email = (c.email ?? c.Email ?? "").trim().toLowerCase();
  if (!email) return null;
  const name =
    (c.full_name ?? c.name ?? c.first_name ?? "").toString().trim() || null;
  const phone =
    (c.mobile ?? c.phone ?? c.telefone ?? c.phone_number ?? "").toString().trim() || null;
  return { email, name, phone };
}

function extractAmountCents(payload: any): number {
  const raw =
    payload?.Commissions?.charge_amount ??
    payload?.charge_amount ??
    payload?.total ??
    payload?.amount ??
    payload?.price ??
    0;
  const n = typeof raw === "string" ? parseFloat(raw) : Number(raw);
  if (!isFinite(n)) return 0;
  // Kiwify manda em centavos na maioria dos campos; se vier decimal (com ponto), converte
  if (typeof raw === "string" && raw.includes(".")) return Math.round(n * 100);
  return Math.round(n);
}

// --------------------------------------------------------------------
// Handlers de eventos
// --------------------------------------------------------------------

async function handleOrderApproved(supabaseAdmin: any, payload: any, eventKey: string) {
  const productId = extractProductId(payload);
  if (!productId) {
    console.warn("[kiwify-webhook] order_approved sem product_id");
    return;
  }
  const mapped = PRODUCT_MAP[productId];
  if (!mapped) {
    console.warn(`[kiwify-webhook] product_id ${productId} não mapeado — ignorando`);
    return;
  }

  const customer = extractCustomer(payload);
  if (!customer) {
    console.warn("[kiwify-webhook] sem email de customer");
    return;
  }

  const userId = await resolveOrInviteUserByEmail(supabaseAdmin, customer.email, customer.name);
  if (!userId) {
    console.error(`[kiwify-webhook] não conseguiu criar usuário para ${customer.email}`);
    return;
  }

  // Sync phone/name (sem sobrescrever)
  if (customer.phone || customer.name) {
    const { data: prof } = await supabaseAdmin
      .from("profiles" as any)
      .select("phone, full_name")
      .eq("id", userId)
      .maybeSingle();
    const patch: Record<string, any> = {};
    if (customer.phone && !(prof as any)?.phone) patch.phone = customer.phone;
    if (customer.name && !(prof as any)?.full_name) patch.full_name = customer.name;
    if (Object.keys(patch).length > 0) {
      await supabaseAdmin.from("profiles" as any).update(patch).eq("id", userId);
    }
  }

  // Busca plano
  const { data: plan } = await supabaseAdmin
    .from("subscription_plans" as any)
    .select("slug, name, monthly_credits")
    .eq("slug", mapped.slug)
    .maybeSingle();
  const monthlyCredits = (plan as any)?.monthly_credits ?? 0;

  // Assinatura anual: current_period_end = agora + 1 ano
  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setFullYear(periodEnd.getFullYear() + 1);

  await supabaseAdmin
    .from("subscriptions" as any)
    .upsert(
      {
        user_id: userId,
        status: "active",
        plan_type: mapped.slug,
        billing_cycle: mapped.cycle,
        current_period_end: periodEnd.toISOString(),
        provider: "kiwify",
      },
      { onConflict: "user_id" },
    );

  // Créditos
  if (monthlyCredits > 0) {
    await addCreditsToUser(supabaseAdmin, {
      userId,
      credits: monthlyCredits,
      reason: `plan:${mapped.slug}:kiwify`,
      metadata: {
        kiwify_order_id: payload?.order_id ?? null,
        kiwify_product_id: productId,
        plan_slug: mapped.slug,
        source: "kiwify_order_approved",
      },
    });

    await supabaseAdmin
      .from("user_credits" as any)
      .update({
        monthly_quota: monthlyCredits,
        quota_reset_at: periodEnd.toISOString(),
      })
      .eq("user_id", userId);
  }

  // Histórico
  const amountCents = extractAmountCents(payload);
  await supabaseAdmin.from("payment_history" as any).insert({
    user_id: userId,
    kind: "subscription",
    description: `${(plan as any)?.name ?? mapped.slug} (Anual) — Kiwify`,
    amount_cents: amountCents,
    currency: (payload?.currency ?? "BRL").toUpperCase(),
    status: "paid",
    credits_added: monthlyCredits,
    stripe_event_id: eventKey, // reutilizamos a coluna como external_event_id
    metadata: {
      provider: "kiwify",
      kiwify_order_id: payload?.order_id ?? null,
      kiwify_product_id: productId,
      plan_slug: mapped.slug,
      billing_cycle: mapped.cycle,
      payment_method: payload?.payment_method ?? null,
    },
  });
}

async function handleRefundOrChargeback(
  supabaseAdmin: any,
  payload: any,
  eventKey: string,
  kind: "refunded" | "chargeback",
) {
  const customer = extractCustomer(payload);
  if (!customer) return;

  const { data: prof } = await supabaseAdmin
    .from("profiles" as any)
    .select("id")
    .ilike("email", customer.email)
    .maybeSingle();
  const userId = (prof as any)?.id as string | undefined;
  if (!userId) {
    console.warn(`[kiwify-webhook] ${kind} sem usuário: ${customer.email}`);
    return;
  }

  // Cancela assinatura
  await supabaseAdmin
    .from("subscriptions" as any)
    .update({ status: "canceled" })
    .eq("user_id", userId);

  const amountCents = extractAmountCents(payload);
  await supabaseAdmin.from("payment_history" as any).insert({
    user_id: userId,
    kind: "subscription",
    description: kind === "chargeback" ? "Chargeback — Kiwify" : "Reembolso — Kiwify",
    amount_cents: -Math.abs(amountCents),
    currency: (payload?.currency ?? "BRL").toUpperCase(),
    status: "refunded",
    credits_added: null,
    stripe_event_id: eventKey,
    metadata: {
      provider: "kiwify",
      kiwify_order_id: payload?.order_id ?? null,
      kiwify_product_id: extractProductId(payload),
      reason: kind,
    },
  });
}

async function handleSubscriptionStatus(
  supabaseAdmin: any,
  payload: any,
  newStatus: "canceled" | "past_due",
) {
  const customer = extractCustomer(payload);
  if (!customer) return;

  const { data: prof } = await supabaseAdmin
    .from("profiles" as any)
    .select("id")
    .ilike("email", customer.email)
    .maybeSingle();
  const userId = (prof as any)?.id as string | undefined;
  if (!userId) return;

  await supabaseAdmin
    .from("subscriptions" as any)
    .update({ status: newStatus })
    .eq("user_id", userId);
}

// --------------------------------------------------------------------
// User resolution (invite silencioso via email)
// --------------------------------------------------------------------

async function resolveOrInviteUserByEmail(
  supabaseAdmin: any,
  email: string,
  fullName: string | null,
): Promise<string | null> {
  // 1) Já existe em profiles?
  const { data: prof } = await supabaseAdmin
    .from("profiles" as any)
    .select("id")
    .ilike("email", email)
    .maybeSingle();
  if ((prof as any)?.id) return (prof as any).id as string;

  // 2) Já existe em auth.users?
  try {
    const { data: list } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    const found = list?.users?.find(
      (u: any) => (u.email ?? "").toLowerCase() === email,
    );
    if (found?.id) return found.id as string;
  } catch (e: any) {
    console.warn("[kiwify-webhook] listUsers falhou:", e?.message);
  }

  // 3) Convida (dispara email de definir senha — mesmo template do Stripe)
  const { data: invited, error: inviteErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(
    email,
    {
      redirectTo: "https://lumma.ia.br/reset-password",
      data: fullName ? { full_name: fullName, name: fullName } : undefined,
    },
  );
  if (inviteErr) {
    console.error("[kiwify-webhook] inviteUserByEmail falhou:", inviteErr.message);
    return null;
  }
  return invited?.user?.id ?? null;
}

// --------------------------------------------------------------------
// Créditos (mesma lógica do Stripe)
// --------------------------------------------------------------------

async function addCreditsToUser(
  supabaseAdmin: any,
  args: {
    userId: string;
    credits: number;
    reason: string;
    metadata: Record<string, any>;
  },
) {
  const { userId, credits, reason, metadata } = args;

  const { data: current } = await supabaseAdmin
    .from("user_credits" as any)
    .select("balance")
    .eq("user_id", userId)
    .maybeSingle();

  const balanceBefore = (current as any)?.balance ?? 0;
  const balanceAfter = balanceBefore + credits;

  if (current) {
    await supabaseAdmin
      .from("user_credits" as any)
      .update({ balance: balanceAfter })
      .eq("user_id", userId);
  } else {
    await supabaseAdmin
      .from("user_credits" as any)
      .insert({ user_id: userId, balance: balanceAfter, monthly_quota: 0 });
  }

  await supabaseAdmin.from("credit_transactions" as any).insert({
    user_id: userId,
    type: "credit",
    amount: credits,
    balance_after: balanceAfter,
    agent_key: null,
    agent_label: reason,
    message_preview: null,
    metadata,
  });

  await supabaseAdmin.from("credit_audit_log" as any).insert({
    user_id: userId,
    admin_id: userId,
    action: "adjust_balance",
    delta: credits,
    balance_before: balanceBefore,
    balance_after: balanceAfter,
    reason,
    metadata,
  });
}
