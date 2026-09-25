/**
 * Renovação Hubla — usada pelo webhook e pelo vínculo manual no admin.
 * Mantém o plano atual da aluna; a oferta Hubla só é registrada.
 */

export interface HublaInvoiceInfo {
  invoiceId: string;
  subscriptionId: string | null;
  amountCents: number;
  billingCycleMonths: number;
  offerId: string | null;
  offerName: string | null;
}

export interface HublaRenewalResult {
  status: "renewed" | "already_processed";
  planType: string;
  creditsAdded: number;
  periodEnd: string | null;
}

export async function applyHublaRenewal(
  supabaseAdmin: any,
  userId: string,
  inv: HublaInvoiceInfo,
): Promise<HublaRenewalResult> {
  // Idempotência: fatura já registrada no histórico?
  const { data: existing } = await supabaseAdmin
    .from("payment_history")
    .select("id")
    .eq("metadata->>hubla_invoice_id", inv.invoiceId)
    .limit(1);
  if (existing && existing.length > 0) {
    return { status: "already_processed", planType: "", creditsAdded: 0, periodEnd: null };
  }

  const { data: sub } = await supabaseAdmin
    .from("subscriptions")
    .select("plan_type, current_period_end")
    .eq("user_id", userId)
    .maybeSingle();
  const planType: string = (sub as any)?.plan_type ?? "starter";

  const months = inv.billingCycleMonths > 0 ? inv.billingCycleMonths : 1;
  const nowMs = Date.now();
  const curMs = (sub as any)?.current_period_end
    ? new Date((sub as any).current_period_end).getTime()
    : 0;
  const base = new Date(Math.max(nowMs, curMs || 0));
  base.setMonth(base.getMonth() + months);
  const periodEnd = base.toISOString();
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

  // Cota do plano atual (fallback: cota já gravada na conta).
  const { data: plan } = await supabaseAdmin
    .from("subscription_plans")
    .select("name, monthly_credits")
    .eq("slug", planType)
    .maybeSingle();
  let quota = Number((plan as any)?.monthly_credits ?? 0);
  if (!quota) {
    const { data: uc } = await supabaseAdmin
      .from("user_credits")
      .select("monthly_quota")
      .eq("user_id", userId)
      .maybeSingle();
    quota = Number((uc as any)?.monthly_quota ?? 0);
  }

  if (quota > 0) {
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
  }

  const { error: phErr } = await supabaseAdmin.from("payment_history").insert({
    user_id: userId,
    kind: "subscription",
    description: `Renovação ${(plan as any)?.name ?? planType} — Hubla`,
    amount_cents: inv.amountCents,
    currency: "BRL",
    status: "paid",
    credits_added: quota,
    metadata: {
      provider: "hubla",
      hubla_invoice_id: inv.invoiceId,
      hubla_subscription_id: inv.subscriptionId,
      offer_id: inv.offerId,
      offer_name: inv.offerName,
      billing_cycle_months: months,
    },
  });
  if (phErr) throw new Error(`payment_history: ${phErr.message}`);

  return { status: "renewed", planType, creditsAdded: quota, periodEnd };
}
