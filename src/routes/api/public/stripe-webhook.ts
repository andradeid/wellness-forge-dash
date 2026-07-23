import { createFileRoute } from "@tanstack/react-router";
import Stripe from "stripe";

/**
 * Webhook público do Stripe.
 * URL: /api/public/stripe-webhook (bypassa auth do site publicado — segurança
 * é feita via verificação de assinatura HMAC do Stripe).
 *
 * Trata:
 *  - checkout.session.completed  → credita pack avulso (mode=payment)
 *  - customer.subscription.created/updated/deleted → sincroniza subscriptions
 *  - invoice.paid                → recarga mensal de créditos do plano
 *
 * Idempotência: cada event.id é registrado em `stripe_webhook_events`
 * antes de processar. Reenvios do Stripe retornam 200 sem duplicar efeito.
 */
export const Route = createFileRoute("/api/public/stripe-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          return await handleStripeWebhook(request);
        } catch (err: any) {
          console.error("[stripe-webhook] fatal error:", err?.message, err);
          return new Response(`Webhook fatal error: ${err?.message ?? "erro desconhecido"}`, { status: 500 });
        }
      },
    },
  },
});

async function handleStripeWebhook(request: Request) {
        const secret = process.env.STRIPE_WEBHOOK_SECRET;
        if (!secret) {
          return new Response("Webhook secret não configurada", { status: 500 });
        }



        const signature = request.headers.get("stripe-signature");
        if (!signature) {
          return new Response("Missing signature", { status: 400 });
        }

        const rawBody = await request.text();

        const { getStripe } = await import("@/lib/stripe.server");
        const stripe = getStripe();

        let event: Stripe.Event;
        try {
          // Cloudflare Workers exige SubtleCryptoProvider explícito
          const cryptoProvider = Stripe.createSubtleCryptoProvider();
          event = await stripe.webhooks.constructEventAsync(
            rawBody,
            signature,
            secret,
            undefined,
            cryptoProvider,
          );
        } catch (err: any) {
          console.error("[stripe-webhook] signature error:", err?.message);
          return new Response(`Signature verification failed: ${err?.message}`, { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // ---------- Idempotência ----------
        const { data: existingEvent, error: existingErr } = await supabaseAdmin
          .from("stripe_webhook_events" as any)
          .select("id")
          .eq("id", event.id)
          .maybeSingle();

        if (existingErr) {
          console.error("[stripe-webhook] idem lookup error:", existingErr);
          return new Response("Erro ao verificar evento", { status: 500 });
        }

        if (existingEvent) {
          return new Response("duplicate", { status: 200 });
        }

        const { error: idemErr } = await supabaseAdmin
          .from("stripe_webhook_events" as any)
          .insert({ id: event.id, type: event.type, payload: event as any });

        if (idemErr) {
          // 23505 = unique_violation → já processado; retorna 200 pro Stripe não reenviar
          const code = (idemErr as any)?.code;
          const message = String((idemErr as any)?.message ?? "").toLowerCase();
          const details = String((idemErr as any)?.details ?? "").toLowerCase();
          if (code === "23505" || message.includes("duplicate") || details.includes("already exists")) {
            return new Response("duplicate", { status: 200 });
          }
          console.error("[stripe-webhook] idem insert error:", idemErr);
          return new Response("Erro ao registrar evento", { status: 500 });
        }

        try {
          switch (event.type) {
            case "checkout.session.completed": {
              const session = event.data.object as Stripe.Checkout.Session;
              await handleCheckoutCompleted(supabaseAdmin, stripe, session, event.id);
              break;
            }
            case "customer.subscription.created":
            case "customer.subscription.updated":
            case "customer.subscription.deleted": {
              const sub = event.data.object as Stripe.Subscription;
              await syncSubscription(supabaseAdmin, sub, stripe);
              break;
            }
            case "invoice.paid":
            case "invoice.payment_succeeded": {
              const invoice = event.data.object as Stripe.Invoice;
              await handleInvoicePaid(supabaseAdmin, stripe, invoice, event.id);
              break;
            }

            case "invoice.payment_failed": {
              const invoice = event.data.object as Stripe.Invoice;
              await recordInvoiceFailure(supabaseAdmin, invoice, event.id);
              break;
            }
            case "charge.refunded": {
              const charge = event.data.object as Stripe.Charge;
              await handleChargeRefunded(supabaseAdmin, stripe, charge, event.id);
              break;
            }
            default:
              // Evento não tratado — ok, ficou registrado
              break;
          }


        } catch (err: any) {
          console.error(`[stripe-webhook] handler error (${event.type}):`, err?.message, err);
          // Remove marcação de idempotência pra permitir retry do Stripe
          await supabaseAdmin
            .from("stripe_webhook_events" as any)
            .delete()
            .eq("id", event.id);
          return new Response(`Handler error: ${err?.message}`, { status: 500 });
        }

        return new Response("ok", { status: 200 });
}

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

type Admin = Awaited<ReturnType<typeof getAdmin>>;
async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/**
 * checkout.session.completed:
 *  - mode=payment  → pack avulso: adiciona `credits` no user_credits e loga transação
 *  - mode=subscription → nada aqui (subscription.created + invoice.paid cuidam)
 */
async function handleCheckoutCompleted(
  supabaseAdmin: Admin,
  stripe: Stripe,
  session: Stripe.Checkout.Session,
  eventId: string,
) {
  const meta = session.metadata ?? {};
  const kind = meta.kind;

  if (session.mode === "payment" && kind === "pack") {
    const userId = meta.user_id;
    const credits = parseInt(meta.credits ?? "0", 10);
    const packSlug = meta.pack_slug ?? null;

    if (!userId || !credits || credits <= 0) {
      console.warn("[stripe-webhook] pack sem metadata válido", { session_id: session.id, meta });
      return;
    }

    if (session.payment_status !== "paid") {
      console.warn("[stripe-webhook] pack não pago ainda", { session_id: session.id, status: session.payment_status });
      return;
    }

    await addCreditsToUser(supabaseAdmin, {
      userId,
      credits,
      reason: `pack:${packSlug ?? "unknown"}`,
      metadata: {
        stripe_session_id: session.id,
        stripe_payment_intent: session.payment_intent as string | null,
        pack_slug: packSlug,
        source: "stripe_pack",
      },
    });

    // Registro no histórico de pagamentos
    await recordPaymentHistory(supabaseAdmin, {
      userId,
      kind: "pack",
      description: `Pacote avulso — ${credits} créditos${packSlug ? ` (${packSlug})` : ""}`,
      amountCents: session.amount_total ?? 0,
      currency: session.currency ?? "brl",
      status: "paid",
      creditsAdded: credits,
      eventId,
      sessionId: session.id,
      paymentIntentId: (session.payment_intent as string | null) ?? null,
      metadata: { pack_slug: packSlug },
    });

    // Email de agradecimento (não bloqueia se falhar)
    try {
      const { data: bal } = await supabaseAdmin
        .from("user_credits" as any)
        .select("balance")
        .eq("user_id", userId)
        .maybeSingle();
      const { sendPackPurchaseEmail } = await import("@/lib/emails.server");
      await sendPackPurchaseEmail({
        userId,
        credits,
        amountCents: session.amount_total ?? 0,
        currency: session.currency ?? "brl",
        balanceAfter: (bal as any)?.balance ?? credits,
      });
    } catch (err: any) {
      console.error("[stripe-webhook] falha ao enviar email de pack:", err?.message);
    }
  }



  // Payment Link de assinatura: session.mode = "subscription".
  // Antes do invoice.payment_succeeded chegar, provisiona o usuário e sincroniza
  // a subscription pra garantir que o vínculo customer→user_id esteja pronto.
  if (session.mode === "subscription" && session.subscription) {
    try {
      const subId = typeof session.subscription === "string"
        ? session.subscription
        : session.subscription.id;
      const sub = await stripe.subscriptions.retrieve(subId);
      await syncSubscription(supabaseAdmin, sub, stripe);
    } catch (err: any) {
      console.error("[stripe-webhook] falha ao sincronizar sub do checkout:", err?.message);
    }
  }
}



/**
 * Sincroniza status/ciclo/período/cancelamento da assinatura na tabela subscriptions.
 * Não credita — a recarga mensal roda em invoice.paid.
 */
async function resolveOrInviteUserByCustomer(
  supabaseAdmin: Admin,
  stripe: Stripe,
  customerId: string,
): Promise<{ userId: string | null; welcomeNeeded: boolean; tempPassword: string; email: string | null; fullName: string | null }> {
  try {
    const customer = await stripe.customers.retrieve(customerId);
    if ((customer as any).deleted) {
      return { userId: null, welcomeNeeded: false, tempPassword: "", email: null, fullName: null };
    }
    const email = ((customer as Stripe.Customer).email ?? "").trim().toLowerCase();
    if (!email) {
      return { userId: null, welcomeNeeded: false, tempPassword: "", email: null, fullName: null };
    }
    const fullName = (customer as Stripe.Customer).name ?? null;

    const { createUserWithTempPassword } = await import("@/lib/user-provisioning.server");
    const res = await createUserWithTempPassword(supabaseAdmin, { email, fullName });
    return {
      userId: res.userId,
      welcomeNeeded: res.welcomeNeeded,
      tempPassword: res.tempPassword,
      email,
      fullName,
    };
  } catch (err: any) {
    console.error("[stripe-webhook] resolveOrInviteUserByCustomer erro:", err?.message);
    return { userId: null, welcomeNeeded: false, tempPassword: "", email: null, fullName: null };
  }
}

/**
 * Copia phone/name do customer do Stripe para o profile do usuário,
 * preenchendo apenas campos vazios (não sobrescreve dados editados pelo user).
 */
async function syncCustomerContactToProfile(
  supabaseAdmin: Admin,
  stripe: Stripe,
  customerId: string,
  userId: string,
) {
  try {
    const customer = await stripe.customers.retrieve(customerId);
    if ((customer as any).deleted) return;
    const c = customer as Stripe.Customer;
    const phone = (c.phone ?? "").trim() || null;
    const fullName = (c.name ?? "").trim() || null;
    if (!phone && !fullName) return;

    const { data: prof } = await supabaseAdmin
      .from("profiles" as any)
      .select("phone, full_name")
      .eq("id", userId)
      .maybeSingle();

    const patch: Record<string, any> = {};
    if (phone && !(prof as any)?.phone) patch.phone = phone;
    if (fullName && !(prof as any)?.full_name) patch.full_name = fullName;
    if (Object.keys(patch).length === 0) return;

    await supabaseAdmin.from("profiles" as any).update(patch).eq("id", userId);
  } catch (err: any) {
    console.warn("[stripe-webhook] syncCustomerContactToProfile falhou:", err?.message);
  }
}

async function syncSubscription(supabaseAdmin: Admin, sub: Stripe.Subscription, stripeArg?: Stripe) {
  const userId = sub.metadata?.user_id ?? null;
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;

  const getStripeLazy = async (): Promise<Stripe> => {
    if (stripeArg) return stripeArg;
    const { getStripe } = await import("@/lib/stripe.server");
    stripeArg = getStripe();
    return stripeArg;
  };

  // Localiza usuário: metadata → stripe_customer_id → email do customer (auto-provisiona)
  let targetUserId: string | null = userId;

  if (!targetUserId) {
    const { data } = await supabaseAdmin
      .from("subscriptions" as any)
      .select("user_id")
      .eq("stripe_customer_id", customerId)
      .maybeSingle();
    targetUserId = (data as any)?.user_id ?? null;
  }
  let provision: Awaited<ReturnType<typeof resolveOrInviteUserByCustomer>> | null = null;
  if (!targetUserId) {
    provision = await resolveOrInviteUserByCustomer(supabaseAdmin, await getStripeLazy(), customerId);
    targetUserId = provision.userId;
  }
  if (!targetUserId) {
    console.warn("[stripe-webhook] subscription sem user_id resolvível", { sub_id: sub.id, customer: customerId });
    return;
  }

  // Preenche phone/full_name a partir do customer do Stripe (só campos vazios)
  await syncCustomerContactToProfile(supabaseAdmin, await getStripeLazy(), customerId, targetUserId);


  const priceId = sub.items.data[0]?.price.id ?? null;
  let planSlug = (sub.metadata?.plan_slug ?? null) as
    | "starter" | "pro" | "clinica" | null;
  let cycle = (sub.metadata?.billing_cycle ?? null) as "monthly" | "yearly" | null;
  let planName: string | null = null;
  let planCredits: number | null = null;

  // Payment Links não carregam metadata → resolve plano/ciclo pelo price_id
  if (priceId) {
    const { data: planRow } = await supabaseAdmin
      .from("subscription_plans" as any)
      .select("slug, name, monthly_credits, stripe_price_monthly_id, stripe_price_yearly_id")
      .or(`stripe_price_monthly_id.eq.${priceId},stripe_price_yearly_id.eq.${priceId}`)
      .maybeSingle();
    if (planRow) {
      if (!planSlug) planSlug = (planRow as any).slug as any;
      if (!cycle) {
        cycle = (planRow as any).stripe_price_yearly_id === priceId ? "yearly" : "monthly";
      }
      planName = (planRow as any).name ?? null;
      planCredits = (planRow as any).monthly_credits ?? null;
    }
  }

  const status = mapSubscriptionStatus(sub.status);
  const periodEndTs = (((sub as any).current_period_end ?? (sub as any).items?.data?.[0]?.current_period_end) as number | null) ?? null;
  const trialEndTs = sub.trial_end as number | null;

  const patch: Record<string, any> = {
    stripe_customer_id: customerId,
    stripe_subscription_id: sub.id,
    stripe_price_id: priceId,
    status,
  };
  if (planSlug) patch.plan_type = planSlug;
  if (cycle) patch.billing_cycle = cycle;
  if (periodEndTs) patch.current_period_end = new Date(periodEndTs * 1000).toISOString();
  if (trialEndTs) patch.trial_ends_at = new Date(trialEndTs * 1000).toISOString();
  patch.cancelled_at = sub.canceled_at ? new Date(sub.canceled_at * 1000).toISOString() : null;

  const { error } = await supabaseAdmin
    .from("subscriptions" as any)
    .upsert({ user_id: targetUserId, ...patch }, { onConflict: "user_id" });
  if (error) throw error;

  // Boas-vindas com senha temporária — só quando acabamos de criar/resetar a conta.
  if (provision?.welcomeNeeded) {
    try {
      const { sendWelcomeNewPurchaseEmail } = await import("@/lib/emails.server");
      await sendWelcomeNewPurchaseEmail({
        userId: targetUserId,
        email: provision.email,
        fullName: provision.fullName,
        tempPassword: provision.tempPassword,
        planName: planName ?? planSlug ?? "Lumma",
        credits: planCredits ?? 0,
      });
    } catch (err: any) {
      console.error("[stripe-webhook] falha ao enviar welcome:", err?.message);
    }
  }
}

/**
 * invoice.paid: cada fatura paga de assinatura recarrega os créditos mensais do plano.
 * Trial (amount_paid=0 na 1ª invoice) não credita — os 20 de trial são liberados
 * separadamente na criação da conta (fora do escopo deste webhook).
 */
async function handleInvoicePaid(
  supabaseAdmin: Admin,
  stripe: Stripe,
  invoice: Stripe.Invoice,
  eventId: string,
) {
  // Stripe 2026-06 (dahlia) moveu `subscription` para parent.subscription_details.subscription
  const parentSubId = (invoice as any).parent?.subscription_details?.subscription as string | null | undefined;
  const legacySubId = (invoice as any).subscription as string | null | undefined;
  const lineSubId = ((invoice as any).lines?.data?.[0]?.parent?.subscription_item_details?.subscription ?? null) as string | null;
  const subId = parentSubId ?? legacySubId ?? lineSubId ?? null;
  if (!subId) return; // fatura avulsa/one-off — nada a fazer aqui
  if (invoice.status !== "paid") return;
  if ((invoice.amount_paid ?? 0) <= 0) return; // trial invoice / R$ 0 → não credita

  const sub = await stripe.subscriptions.retrieve(subId);
  const priceId = sub.items.data[0]?.price.id ?? null;
  if (!priceId) return;

  // Descobre plano + créditos mensais pelo price_id
  const { data: plan } = await supabaseAdmin
    .from("subscription_plans" as any)
    .select("slug, name, monthly_credits, stripe_price_monthly_id, stripe_price_yearly_id")
    .or(`stripe_price_monthly_id.eq.${priceId},stripe_price_yearly_id.eq.${priceId}`)
    .maybeSingle();

  if (!plan) {
    console.warn("[stripe-webhook] invoice.paid sem plano correspondente", { price_id: priceId });
    return;
  }

  const monthlyCredits = (plan as any).monthly_credits as number;
  if (!monthlyCredits || monthlyCredits <= 0) return;

  const userId = sub.metadata?.user_id ?? null;
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  let targetUserId: string | null = userId;
  if (!targetUserId) {
    const { data } = await supabaseAdmin
      .from("subscriptions" as any)
      .select("user_id")
      .eq("stripe_customer_id", customerId)
      .maybeSingle();
    targetUserId = (data as any)?.user_id ?? null;
  }
  let invoiceProvision: Awaited<ReturnType<typeof resolveOrInviteUserByCustomer>> | null = null;
  if (!targetUserId) {
    invoiceProvision = await resolveOrInviteUserByCustomer(supabaseAdmin, stripe, customerId);
    targetUserId = invoiceProvision.userId;
  }
  if (!targetUserId) return;

  await syncCustomerContactToProfile(supabaseAdmin, stripe, customerId, targetUserId);

  // Garante plan_type/billing_cycle/status/period_end corretos mesmo quando o
  // checkout.session.completed processou antes do user existir.
  try {
    await syncSubscription(supabaseAdmin, sub, stripe);
  } catch (err: any) {
    console.error("[stripe-webhook] syncSubscription no invoice falhou:", err?.message);
  }




  await addCreditsToUser(supabaseAdmin, {
    userId: targetUserId,
    credits: monthlyCredits,
    reason: `plan:${(plan as any).slug}:renewal`,
    metadata: {
      stripe_invoice_id: invoice.id,
      stripe_subscription_id: sub.id,
      stripe_price_id: priceId,
      plan_slug: (plan as any).slug,
      source: "stripe_invoice",
    },
  });

  // Atualiza monthly_quota + quota_reset_at
  const periodEndTs = (((sub as any).current_period_end ?? (sub as any).items?.data?.[0]?.current_period_end) as number | null) ?? null;
  await supabaseAdmin
    .from("user_credits" as any)
    .update({
      monthly_quota: monthlyCredits,
      quota_reset_at: periodEndTs ? new Date(periodEndTs * 1000).toISOString() : null,
    })
    .eq("user_id", targetUserId);

  // Histórico de pagamento — resolve ciclo por metadata OU price_id
  let cycle = (sub.metadata?.billing_cycle ?? null) as "monthly" | "yearly" | null;
  if (!cycle) {
    cycle = (plan as any).stripe_price_yearly_id === priceId ? "yearly" : "monthly";
  }
  await recordPaymentHistory(supabaseAdmin, {
    userId: targetUserId,
    kind: "subscription",
    description: `Assinatura ${(plan as any).name ?? (plan as any).slug} — ${cycle === "yearly" ? "anual" : "mensal"}`,
    amountCents: invoice.amount_paid ?? 0,
    currency: invoice.currency ?? "brl",
    status: "paid",
    creditsAdded: monthlyCredits,
    eventId,
    invoiceId: invoice.id ?? null,
    hostedInvoiceUrl: (invoice as any).hosted_invoice_url ?? null,
    metadata: { plan_slug: (plan as any).slug, billing_cycle: cycle, stripe_subscription_id: sub.id },
  });

  // Email de ativação — apenas na primeira fatura da assinatura (não em renovações)
  const billingReason = (invoice as any).billing_reason as string | undefined;
  if (billingReason === "subscription_create") {
    try {
      const { sendSubscriptionActivatedEmail } = await import("@/lib/emails.server");
      await sendSubscriptionActivatedEmail({
        userId: targetUserId,
        planName: ((plan as any).name ?? (plan as any).slug ?? "Lumma") as string,
        credits: monthlyCredits,
        amountCents: invoice.amount_paid ?? 0,
        currency: invoice.currency ?? "brl",
        billingCycle: cycle,
        nextRenewalIso: periodEndTs ? new Date(periodEndTs * 1000).toISOString() : null,
      });
    } catch (err: any) {
      console.error("[stripe-webhook] falha ao enviar email de assinatura:", err?.message);
    }
  }

  // Boas-vindas com senha temporária — só quando provisionamos a conta aqui.
  if (invoiceProvision?.welcomeNeeded) {
    try {
      const { sendWelcomeNewPurchaseEmail } = await import("@/lib/emails.server");
      await sendWelcomeNewPurchaseEmail({
        userId: targetUserId,
        email: invoiceProvision.email,
        fullName: invoiceProvision.fullName,
        tempPassword: invoiceProvision.tempPassword,
        planName: ((plan as any).name ?? (plan as any).slug ?? "Lumma") as string,
        credits: monthlyCredits,
      });
    } catch (err: any) {
      console.error("[stripe-webhook] falha ao enviar welcome:", err?.message);
    }
  }
}

async function recordInvoiceFailure(
  supabaseAdmin: Admin,
  invoice: Stripe.Invoice,
  eventId: string,
) {
  const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
  if (!customerId) return;
  const { data } = await supabaseAdmin
    .from("subscriptions" as any)
    .select("user_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  const userId = (data as any)?.user_id;
  if (!userId) return;

  await recordPaymentHistory(supabaseAdmin, {
    userId,
    kind: "subscription",
    description: "Falha no pagamento da assinatura",
    amountCents: invoice.amount_due ?? 0,
    currency: invoice.currency ?? "brl",
    status: "failed",
    creditsAdded: null,
    eventId,
    invoiceId: invoice.id ?? null,
    hostedInvoiceUrl: (invoice as any).hosted_invoice_url ?? null,
    metadata: {},
  });
}

/**
 * charge.refunded: trata reembolso total ou parcial.
 * - Localiza o pagamento original em payment_history via payment_intent
 * - Marca como refunded (ou mantém paid se parcial e ainda restou valor)
 * - Se for pack: debita créditos correspondentes (piso em 0) e registra transação refund
 * - Se for assinatura: apenas marca o histórico (o Stripe emite subscription.deleted se cancelar)
 */
async function handleChargeRefunded(
  supabaseAdmin: Admin,
  _stripe: Stripe,
  charge: Stripe.Charge,
  eventId: string,
) {
  const paymentIntentId = typeof charge.payment_intent === "string"
    ? charge.payment_intent
    : charge.payment_intent?.id ?? null;
  if (!paymentIntentId) {
    console.warn("[stripe-webhook] charge.refunded sem payment_intent", { charge_id: charge.id });
    return;
  }

  const amountRefunded = charge.amount_refunded ?? 0;
  const fullyRefunded = charge.refunded === true || amountRefunded >= (charge.amount ?? 0);

  // Localiza pagamento original em payment_history
  const { data: original } = await supabaseAdmin
    .from("payment_history" as any)
    .select("id, user_id, kind, amount_cents, credits_added, metadata, status")
    .eq("stripe_payment_intent_id", paymentIntentId)
    .maybeSingle();

  if (!original) {
    console.warn("[stripe-webhook] charge.refunded sem payment_history correspondente", { pi: paymentIntentId });
    return;
  }

  const userId = (original as any).user_id as string;
  const kind = (original as any).kind as "pack" | "subscription";
  const originalCredits = ((original as any).credits_added ?? 0) as number;

  // Atualiza status do pagamento original
  await supabaseAdmin
    .from("payment_history" as any)
    .update({
      status: fullyRefunded ? "refunded" : "paid",
      metadata: {
        ...((original as any).metadata ?? {}),
        refunded_amount_cents: amountRefunded,
        refunded_at: new Date().toISOString(),
        refund_event_id: eventId,
      },
    })
    .eq("id", (original as any).id);

  // Registra linha separada de reembolso no histórico (visível pro usuário)
  await recordPaymentHistory(supabaseAdmin, {
    userId,
    kind,
    description: fullyRefunded
      ? `Reembolso total — ${(original as any).kind === "pack" ? "pacote de créditos" : "assinatura"}`
      : `Reembolso parcial — ${(original as any).kind === "pack" ? "pacote de créditos" : "assinatura"}`,
    amountCents: -amountRefunded,
    currency: charge.currency ?? "brl",
    status: "refunded",
    creditsAdded: null,
    eventId,
    paymentIntentId,
    metadata: { original_payment_id: (original as any).id, fully_refunded: fullyRefunded },
  });

  // Se for pack e for reembolso total, debita os créditos concedidos (piso em 0)
  if (kind === "pack" && fullyRefunded && originalCredits > 0) {
    const { data: current } = await supabaseAdmin
      .from("user_credits" as any)
      .select("balance")
      .eq("user_id", userId)
      .maybeSingle();
    const balanceBefore = ((current as any)?.balance ?? 0) as number;
    const debit = Math.min(balanceBefore, originalCredits);
    const balanceAfter = balanceBefore - debit;

    if (debit > 0) {
      await supabaseAdmin
        .from("user_credits" as any)
        .update({ balance: balanceAfter })
        .eq("user_id", userId);

      await supabaseAdmin.from("credit_transactions" as any).insert({
        user_id: userId,
        type: "refund",
        amount: debit,
        balance_after: balanceAfter,
        agent_key: null,
        agent_label: "refund:pack",
        message_preview: `Estorno de ${originalCredits} créditos (reembolso Stripe)`,
        metadata: { payment_intent: paymentIntentId, original_credits: originalCredits, debited: debit, event_id: eventId },
      });

      await supabaseAdmin.from("credit_audit_log" as any).insert({
        user_id: userId,
        admin_id: userId,
        action: "refund_debit",
        delta: -debit,
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        reason: "stripe_refund",
        metadata: { payment_intent: paymentIntentId, original_credits: originalCredits, event_id: eventId },
      });
    }
  }
}

async function recordPaymentHistory(
  supabaseAdmin: Admin,

  args: {
    userId: string;
    kind: "subscription" | "pack";
    description: string;
    amountCents: number;
    currency: string;
    status: "paid" | "failed" | "refunded" | "pending";
    creditsAdded: number | null;
    eventId: string;
    invoiceId?: string | null;
    sessionId?: string | null;
    paymentIntentId?: string | null;
    hostedInvoiceUrl?: string | null;
    metadata: Record<string, any>;
  },
) {
  const { error } = await supabaseAdmin.from("payment_history" as any).insert({
    user_id: args.userId,
    kind: args.kind,
    description: args.description,
    amount_cents: args.amountCents,
    currency: args.currency,
    status: args.status,
    credits_added: args.creditsAdded,
    stripe_event_id: args.eventId,
    stripe_invoice_id: args.invoiceId ?? null,
    stripe_session_id: args.sessionId ?? null,
    stripe_payment_intent_id: args.paymentIntentId ?? null,
    hosted_invoice_url: args.hostedInvoiceUrl ?? null,
    metadata: args.metadata,
  });
  // Ignora conflito por stripe_event_id (idempotência)
  if (error && (error as any).code !== "23505") {
    console.error("[stripe-webhook] payment_history insert error:", error);
  }
}


// ------------------------------------------------------------------

function mapSubscriptionStatus(s: Stripe.Subscription.Status):
  "trial" | "active" | "past_due" | "canceled" {
  switch (s) {
    case "trialing": return "trial";
    case "active": return "active";
    case "past_due":
    case "unpaid":
    case "incomplete": return "past_due";
    case "canceled":
    case "incomplete_expired":
    case "paused":
    default: return "canceled";
  }
}

async function addCreditsToUser(
  supabaseAdmin: Admin,
  args: {
    userId: string;
    credits: number;
    reason: string;
    metadata: Record<string, any>;
  },
) {
  const { userId, credits, reason, metadata } = args;

  // Lê saldo atual (linha existe sempre pra usuário ativo; cria se faltar)
  const { data: current } = await supabaseAdmin
    .from("user_credits" as any)
    .select("balance")
    .eq("user_id", userId)
    .maybeSingle();

  const balanceBefore = (current as any)?.balance ?? 0;
  const balanceAfter = balanceBefore + credits;

  if (current) {
    const { error } = await supabaseAdmin
      .from("user_credits" as any)
      .update({ balance: balanceAfter })
      .eq("user_id", userId);
    if (error) throw error;
  } else {
    const { error } = await supabaseAdmin
      .from("user_credits" as any)
      .insert({ user_id: userId, balance: balanceAfter, monthly_quota: 0 });
    if (error) throw error;
  }

  // Transação (histórico visível pro usuário)
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

  // Log administrativo (imutável)
  await supabaseAdmin.from("credit_audit_log" as any).insert({
    user_id: userId,
    admin_id: userId, // sem admin humano — usa o próprio user_id (satisfaz NOT NULL)
    action: "adjust_balance",
    delta: credits,
    balance_before: balanceBefore,
    balance_after: balanceAfter,
    reason,
    metadata,
  });
}
