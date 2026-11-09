import { timingSafeEqual } from "crypto";
import { fillSubscriptionOrigin } from "@/lib/subscription-origin";
import {
  parseTmbOrder,
  redactTmbPayload,
  resolveTmbProduct,
  tmbEventKey,
  tmbValidityLabel,
  type TmbOrder,
  type TmbProduct,
} from "@/lib/tmb";

/**
 * Webhook de Vendas da TMB (Tem Mais no Boleto).
 * URL cadastrada no produto da TMB: /api/public/tmb-webhook?produto=nova-nutricionista
 * Autenticação: na TMB, Chave = x-tmb-token e Valor = TMB_WEBHOOK_TOKEN.
 *
 * Efetivado → cria a conta (ou usa a existente), ativa o plano do produto pela
 *             validade do catálogo (src/lib/tmb.ts), credita a cota do mês,
 *             registra o pagamento e manda o e-mail de boas-vindas/confirmação.
 * Cancelado → cancela a assinatura se o pedido cancelado for a compra vigente.
 * Idempotência: stripe_webhook_events com id "tmb:<pedido>:<status>".
 * Todo evento recebido vai para integration_logs (source "tmb"), sem CPF nem endereço.
 */

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

async function log(sb: any, event: string, status: string, message: string | null, payload: unknown) {
  try {
    await sb.from("integration_logs").insert({
      source: "tmb",
      event: event.slice(0, 255),
      status,
      message: message ? message.slice(0, 1000) : null,
      payload: (payload && typeof payload === "object" ? payload : { payload }) as any,
    });
  } catch (e) {
    console.warn("[tmb-webhook] falha ao gravar log:", e);
  }
}

export async function handleTmbWebhook(request: Request, deps?: { supabaseAdmin?: any; emails?: any }) {
  const expected = process.env.TMB_WEBHOOK_TOKEN;
  if (!expected) return new Response("TMB_WEBHOOK_TOKEN não configurado", { status: 500 });

  const url = new URL(request.url);
  const bearer = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const supplied =
    request.headers.get("x-tmb-token") ?? (bearer || null) ?? url.searchParams.get("token") ?? "";
  if (!supplied || !safeEqual(supplied, expected)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const raw = await request.text();
  if (raw.length > 512 * 1024) return new Response("Payload too large", { status: 413 });
  let body: any;
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return new Response("Body JSON inválido", { status: 400 });
  }
  // A TMB pode mandar um objeto ou uma lista com um pedido.
  const payload = Array.isArray(body) ? body[0] ?? {} : body;

  const sb = deps?.supabaseAdmin ?? (await import("@/integrations/supabase/client.server")).supabaseAdmin;
  const order = parseTmbOrder(payload);
  const safePayload = redactTmbPayload(payload);
  const eventKey = tmbEventKey(order);

  if (!order.pedido || !order.statusRaw) {
    await log(sb, "payload_incompleto", "error", "Sem número do pedido ou sem status_pedido", safePayload);
    return new Response("Pedido ou status ausente", { status: 400 });
  }

  // Idempotência
  const { error: idemErr } = await sb
    .from("stripe_webhook_events" as any)
    .insert({ id: eventKey, type: `tmb.${order.status === "outro" ? order.statusRaw.toLowerCase() : order.status}`, payload: safePayload });
  if (idemErr && (idemErr as any).code === "23505") {
    await log(sb, order.statusRaw, "duplicate", `Pedido ${order.pedido} já processado`, safePayload);
    return new Response("duplicate", { status: 200 });
  }
  if (idemErr) {
    console.error("[tmb-webhook] idem insert erro:", idemErr);
    return new Response("Erro ao registrar evento", { status: 500 });
  }

  const resolved = resolveTmbProduct(url.searchParams.get("produto"), order);

  try {
    if (order.status === "efetivado") {
      if (!resolved) {
        await log(sb, "efetivado", "ignored", `Produto não reconhecido (produto=${url.searchParams.get("produto") ?? "-"}, lançamento=${order.lancamento ?? "-"})`, safePayload);
        return new Response("produto não mapeado", { status: 200 });
      }
      const msg = await grantAccess(sb, order, resolved.key, resolved.product, eventKey, safePayload, deps?.emails);
      await log(sb, "efetivado", msg.ok ? "success" : "error", msg.text, safePayload);
      if (!msg.ok) return new Response(msg.text, { status: 500 });
    } else if (order.status === "cancelado") {
      const text = await cancelAccess(sb, order, eventKey);
      await log(sb, "cancelado", "success", text, safePayload);
    } else {
      await log(sb, order.statusRaw, "ignored", `Status "${order.statusRaw}" não altera o acesso`, safePayload);
    }
  } catch (err: any) {
    // Libera o evento para a TMB poder reenviar.
    await sb.from("stripe_webhook_events" as any).delete().eq("id", eventKey);
    await log(sb, order.statusRaw, "error", err?.message ?? "erro", safePayload);
    return new Response(`Erro: ${err?.message ?? "erro"}`, { status: 500 });
  }

  return new Response("ok", { status: 200 });
}

function periodEndFrom(order: TmbOrder, years: number): Date {
  const base = order.dataEfetivado ? new Date(order.dataEfetivado.replace(" ", "T")) : new Date();
  const start = isNaN(base.getTime()) || base.getTime() > Date.now() + 86400000 ? new Date() : base;
  const end = new Date(start);
  end.setFullYear(end.getFullYear() + years);
  return end;
}

async function grantAccess(
  sb: any,
  order: TmbOrder,
  productKey: string,
  product: TmbProduct,
  eventKey: string,
  safePayload: Record<string, unknown>,
  emails?: any,
): Promise<{ ok: boolean; text: string }> {
  if (!order.email) return { ok: false, text: `Pedido ${order.pedido} sem e-mail do cliente` };

  const { createUserWithTempPassword } = await import("@/lib/user-provisioning.server");
  const provision = await createUserWithTempPassword(sb, {
    email: order.email,
    fullName: order.nome,
    origin: "tmb",
  });
  const userId = provision.userId;
  if (!userId) return { ok: false, text: `Não foi possível criar a conta de ${order.email}` };

  // Telefone e nome no perfil, sem sobrescrever o que já existe.
  if (order.telefone || order.nome) {
    const { data: prof } = await sb.from("profiles" as any).select("phone, full_name").eq("id", userId).maybeSingle();
    const patch: Record<string, any> = {};
    if (order.telefone && !(prof as any)?.phone) patch.phone = order.telefone;
    if (order.nome && !(prof as any)?.full_name) patch.full_name = order.nome;
    if (Object.keys(patch).length) await sb.from("profiles" as any).update(patch).eq("id", userId);
  }

  const { data: plan } = await sb
    .from("subscription_plans" as any)
    .select("slug, name, monthly_credits")
    .eq("slug", product.slug)
    .maybeSingle();
  const monthlyCredits = Number((plan as any)?.monthly_credits ?? 0);
  const planName = (plan as any)?.name ?? product.slug;

  const periodEnd = periodEndFrom(order, product.years);
  const { error: subErr } = await sb.from("subscriptions" as any).upsert(
    {
      user_id: userId,
      status: "active",
      plan_type: product.slug,
      billing_cycle: product.cycle,
      current_period_end: periodEnd.toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (subErr) throw new Error(`Assinatura: ${subErr.message}`);

  await fillSubscriptionOrigin(sb, userId, "tmb");
  await sb.rpc("disable_unlimited_on_purchase", { p_user_id: userId, p_source: "compra TMB" });

  if (monthlyCredits > 0) {
    await addCredits(sb, userId, monthlyCredits, `plan:${product.slug}:tmb`, {
      tmb_pedido: order.pedido,
      tmb_produto: productKey,
      plan_slug: product.slug,
      source: "tmb_efetivado",
    });
    const nextReset = new Date();
    nextReset.setMonth(nextReset.getMonth() + 1);
    await sb
      .from("user_credits" as any)
      .update({ monthly_quota: monthlyCredits, quota_reset_at: nextReset.toISOString() })
      .eq("user_id", userId);
  }

  await sb.from("payment_history" as any).insert({
    user_id: userId,
    kind: "subscription",
    description: `${planName} (${tmbValidityLabel(product.years)}) — TMB · ${product.label}`,
    amount_cents: order.valorCents,
    currency: "BRL",
    status: "paid",
    credits_added: monthlyCredits,
    stripe_event_id: eventKey,
    metadata: {
      provider: "tmb",
      tmb_pedido: order.pedido,
      tmb_produto: productKey,
      tmb_lancamento: safePayload.lancamento ?? null,
      plan_slug: product.slug,
      billing_cycle: product.cycle,
      parcelas: order.parcelas,
      valor_total: safePayload.valor_total ?? null,
    },
  });

  const mail = emails ?? (await import("@/lib/emails.server"));
  try {
    if (provision.welcomeNeeded) {
      await mail.sendWelcomeNewPurchaseEmail({
        trigger: "tmb",
        userId,
        email: order.email,
        fullName: order.nome,
        tempPassword: provision.tempPassword,
        planName,
        credits: monthlyCredits,
      });
    } else {
      await mail.sendSubscriptionActivatedEmail({
        userId,
        planName,
        credits: monthlyCredits,
        amountCents: order.valorCents,
        currency: "BRL",
        billingCycle: product.cycle,
        nextRenewalIso: periodEnd.toISOString(),
      });
    }
  } catch (err: any) {
    console.error("[tmb-webhook] falha no e-mail:", err?.message);
  }

  return {
    ok: true,
    text: `Pedido ${order.pedido}: ${planName} até ${periodEnd.toISOString().slice(0, 10)} (${provision.isNew ? "conta nova" : "conta existente"})`,
  };
}

async function cancelAccess(sb: any, order: TmbOrder, eventKey: string): Promise<string> {
  if (!order.email) return `Pedido ${order.pedido} cancelado sem e-mail — nada a fazer`;
  const { data: prof } = await sb.from("profiles" as any).select("id").ilike("email", order.email).maybeSingle();
  const userId = (prof as any)?.id as string | undefined;
  if (!userId) return `Pedido ${order.pedido} cancelado, mas não há conta para ${order.email}`;

  // Só cancela se o pedido cancelado for a compra que sustenta a assinatura atual.
  const { data: lastPaid } = await sb
    .from("payment_history" as any)
    .select("metadata")
    .eq("user_id", userId)
    .eq("status", "paid")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const currentPedido = ((lastPaid as any)?.metadata?.tmb_pedido ?? null) as string | null;
  const shouldCancel = currentPedido === order.pedido;

  if (shouldCancel) {
    await sb.from("subscriptions" as any).update({ status: "canceled" }).eq("user_id", userId);
  }
  await sb.from("payment_history" as any).insert({
    user_id: userId,
    kind: "subscription",
    description: "Cancelamento — TMB",
    amount_cents: -Math.abs(order.valorCents),
    currency: "BRL",
    status: "refunded",
    credits_added: null,
    stripe_event_id: eventKey,
    metadata: { provider: "tmb", tmb_pedido: order.pedido, reason: "cancelado" },
  });
  return shouldCancel
    ? `Pedido ${order.pedido} cancelado: assinatura cancelada`
    : `Pedido ${order.pedido} cancelado, mas não é a compra vigente (${currentPedido ?? "nenhuma pela TMB"}): assinatura mantida`;
}

async function addCredits(sb: any, userId: string, credits: number, reason: string, metadata: Record<string, any>) {
  const { data: current } = await sb.from("user_credits" as any).select("balance").eq("user_id", userId).maybeSingle();
  const balanceBefore = Number((current as any)?.balance ?? 0);
  const balanceAfter = balanceBefore + credits;
  if (current) {
    await sb.from("user_credits" as any).update({ balance: balanceAfter }).eq("user_id", userId);
  } else {
    await sb.from("user_credits" as any).insert({
      user_id: userId,
      balance: balanceAfter,
      monthly_quota: credits,
      quota_reset_at: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
    });
  }
  await sb.from("credit_transactions" as any).insert({
    user_id: userId,
    type: "credit",
    amount: credits,
    balance_after: balanceAfter,
    agent_key: null,
    agent_label: reason,
    message_preview: null,
    metadata,
  });
  await sb.from("credit_audit_log" as any).insert({
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
