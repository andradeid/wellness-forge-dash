/**
 * Renovação Hubla — usada pelo webhook e pelo vínculo manual no admin.
 * Mantém o plano atual da aluna; a oferta Hubla só é registrada.
 * Vencimento = max(atual, saleDate + ciclo) — nunca acumula.
 * Créditos só para pagamentos dos últimos 35 dias.
 */

export interface HublaInvoiceInfo {
  invoiceId: string;
  subscriptionId: string | null;
  amountCents: number;
  billingCycleMonths: number;
  offerId: string | null;
  offerName: string | null;
  /** ISO da venda (saleDate → statusAt "paid" → agora). */
  saleDate: string;
}

export interface HublaRenewalResult {
  status: "renewed" | "already_processed" | "no_plan";
  planType: string;
  creditsAdded: number;
  creditsStatus: "reposto" | "pulado" | "n/a";
  saleDate: string;
  oldPeriodEnd: string | null;
  periodEnd: string | null;
}

const RECENT_MS = 35 * 24 * 3600 * 1000;

export async function applyHublaRenewal(
  supabaseAdmin: any,
  userId: string,
  inv: HublaInvoiceInfo,
  opts: { planOverride?: string } = {},
): Promise<HublaRenewalResult> {
  const base = {
    planType: "", creditsAdded: 0, creditsStatus: "n/a" as const,
    saleDate: inv.saleDate, oldPeriodEnd: null, periodEnd: null,
  };

  // Idempotência: fatura já registrada no histórico?
  const { data: existing } = await supabaseAdmin
    .from("payment_history")
    .select("id")
    .eq("metadata->>hubla_invoice_id", inv.invoiceId)
    .limit(1);
  if (existing && existing.length > 0) return { status: "already_processed", ...base };

  const { data: sub } = await supabaseAdmin
    .from("subscriptions")
    .select("plan_type, current_period_end")
    .eq("user_id", userId)
    .maybeSingle();
  const planType: string = opts.planOverride || (sub as any)?.plan_type || "";
  if (!planType) return { status: "no_plan", ...base };

  const oldPeriodEnd: string | null = (sub as any)?.current_period_end ?? null;
  const months = inv.billingCycleMonths > 0 ? inv.billingCycleMonths : 1;
  const saleMs = new Date(inv.saleDate).getTime();
  const newEnd = new Date(saleMs);
  newEnd.setMonth(newEnd.getMonth() + months);
  const oldMs = oldPeriodEnd ? new Date(oldPeriodEnd).getTime() : 0;
  const periodEnd = new Date(Math.max(oldMs, newEnd.getTime())).toISOString();
  const cycle = months >= 12 ? "yearly" : "monthly";

  const { error: subErr } = await supabaseAdmin.from("subscriptions").upsert(
    {
      user_id: userId,
      plan_type: planType,
      status: "active",
      billing_cycle: cycle,
      current_period_end: periodEnd,
      origin: "hubla",
    },
    { onConflict: "user_id" },
  );
  if (subErr) throw new Error(`subscriptions: ${subErr.message}`);

  const { data: plan } = await supabaseAdmin
    .from("subscription_plans")
    .select("name, monthly_credits")
    .eq("slug", planType)
    .maybeSingle();
  let quota = Number((plan as any)?.monthly_credits ?? 0);
  if (!quota) {
    const { data: uc } = await supabaseAdmin
      .from("user_credits").select("monthly_quota").eq("user_id", userId).maybeSingle();
    quota = Number((uc as any)?.monthly_quota ?? 0);
  }

  const isRecent = Date.now() - saleMs <= RECENT_MS;
  let creditsAdded = 0;
  if (isRecent && quota > 0) {
    const { error: renewErr } = await supabaseAdmin.rpc("apply_plan_renewal", {
      p_user_id: userId,
      p_quota: quota,
      p_reason: `plan:${planType}:renewal:hubla`,
      p_metadata: {
        hubla_invoice_id: inv.invoiceId,
        hubla_subscription_id: inv.subscriptionId,
        plan_slug: planType,
        source: "hubla_invoice",
      },
    });
    if (renewErr) throw new Error(`apply_plan_renewal falhou: ${renewErr.message}`);
    const nextReset = new Date();
    nextReset.setMonth(nextReset.getMonth() + 1);
    await supabaseAdmin
      .from("user_credits")
      .update({ monthly_quota: quota, quota_reset_at: nextReset.toISOString() })
      .eq("user_id", userId);
    creditsAdded = quota;
  }

  const { error: phErr } = await supabaseAdmin.from("payment_history").insert({
    user_id: userId,
    kind: "subscription",
    description: `Renovação ${(plan as any)?.name ?? planType} — Hubla`,
    amount_cents: inv.amountCents,
    currency: "BRL",
    status: "paid",
    credits_added: creditsAdded,
    metadata: {
      provider: "hubla",
      hubla_invoice_id: inv.invoiceId,
      hubla_subscription_id: inv.subscriptionId,
      offer_id: inv.offerId,
      offer_name: inv.offerName,
      billing_cycle_months: months,
      sale_date: inv.saleDate,
      ...(isRecent ? {} : { credits_skipped: "pagamento antigo (reprocessamento)" }),
    },
  });
  if (phErr) throw new Error(`payment_history: ${phErr.message}`);

  return {
    status: "renewed",
    planType,
    creditsAdded,
    creditsStatus: isRecent ? "reposto" : "pulado",
    saleDate: inv.saleDate,
    oldPeriodEnd,
    periodEnd,
  };
}
