import { createFileRoute } from "@tanstack/react-router";
import { tokenMatches } from "@/lib/webhook-tokens.server";
import type { HublaInvoiceInfo } from "@/lib/hubla-renewal.server";

/**
 * Webhook público da Hubla (payload v2.0.0).
 * Só processa renovações de alunas já cadastradas; nunca cria conta.
 * Auth: header x-hubla-token igual a HUBLA_WEBHOOK_TOKEN (aceita mais de um, separados por vírgula: conta nova e antiga).
 */


async function log(sb: any, event: string, status: string, message: string | null, payload: unknown) {
  await sb.from("integration_logs").insert({
    source: "hubla",
    event: event.slice(0, 255),
    status,
    message: message ? message.slice(0, 1000) : null,
    payload: (payload && typeof payload === "object" ? payload : { payload }) as any,
  });
}

/** Aplica a carência da renovação; devolve a mensagem de log ou null se não mexeu. */
async function applyGrace(sb: any, ev: any): Promise<string | null> {
  const invoice = ev?.invoice ?? {};
  const email = String(invoice.payer?.email ?? ev?.user?.email ?? "").trim().toLowerCase();
  const hasSubscription = Boolean(invoice.subscriptionId ?? ev?.subscriptions?.[0]?.id);
  if (!email || !hasSubscription || String(invoice.status ?? "") !== "unpaid") return null;

  const { data: prof } = await sb.from("profiles").select("id").ilike("email", email).limit(1);
  const userId = prof?.[0]?.id as string | undefined;
  if (!userId) return null;

  const { data: sub } = await sb
    .from("subscriptions")
    .select("status, current_period_end, origin")
    .eq("user_id", userId)
    .maybeSingle();
  if (!sub || !String(sub.origin ?? "").includes("hubla")) return null;

  const { computeHublaGraceEnd } = await import("@/lib/hubla-grace");
  const newEnd = computeHublaGraceEnd({
    invoiceStatus: invoice.status,
    dueDate: invoice.dueDate,
    hasSubscription,
    subStatus: sub.status,
    currentPeriodEnd: sub.current_period_end,
  });
  if (!newEnd) return null;

  const { error } = await sb
    .from("subscriptions")
    .update({ current_period_end: newEnd, status: "active" })
    .eq("user_id", userId);
  if (error) throw new Error(`carência: ${error.message}`);
  return `Carência até o vencimento: ${email} ${sub.current_period_end} → ${newEnd} (fatura ${invoice.id ?? "?"})`;
}

export const Route = createFileRoute("/api/public/hubla-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.HUBLA_WEBHOOK_TOKEN;
        if (!expected) return new Response("HUBLA_WEBHOOK_TOKEN não configurado", { status: 500 });
        const supplied = request.headers.get("x-hubla-token") ?? "";
        if (!tokenMatches(supplied, expected)) {
          return new Response("Unauthorized", { status: 401 });
        }

        const raw = await request.text();
        if (raw.length > 512 * 1024) return new Response("Payload too large", { status: 413 });
        let body: any;
        try {
          body = JSON.parse(raw);
        } catch {
          return new Response("Body JSON inválido", { status: 400 });
        }

        const type = String(body?.type ?? "").trim();
        const ev = body?.event ?? {};
        if (!type) return new Response("Missing type", { status: 400 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const sb = supabaseAdmin as any;

        try {
          if (type === "invoice.status_updated") {
            // Carência: fatura de renovação gerada e ainda não paga → acesso até o vencimento.
            const msg = await applyGrace(sb, ev);
            await log(sb, type, msg ? "grace" : "ignored", msg ?? "Evento registrado sem alteração na assinatura", body);
            return new Response("ok", { status: 200 });
          }
          if (type !== "invoice.payment_succeeded") {
            await log(sb, type, "ignored", "Evento registrado sem alteração na assinatura", body);
            return new Response("ok", { status: 200 });
          }

          const invoice = ev.invoice ?? {};
          const invoiceId = String(invoice.id ?? "");
          if (!invoiceId) {
            await log(sb, type, "error", "Fatura sem id", body);
            return new Response("ok", { status: 200 });
          }

          // Idempotência
          const eventKey = `hubla:${type}:${invoiceId}`;
          const { error: idemErr } = await sb
            .from("stripe_webhook_events")
            .insert({ id: eventKey, type: `hubla.${type}`, payload: body });
          if (idemErr?.code === "23505") return new Response("duplicate", { status: 200 });
          if (idemErr) throw new Error(`idempotência: ${idemErr.message}`);

          const email = String(
            invoice.payer?.email ?? ev.user?.email ?? ev.subscription?.payer?.email ?? "",
          ).trim().toLowerCase();
          const name =
            [invoice.payer?.firstName, invoice.payer?.lastName].filter(Boolean).join(" ") ||
            ev.user?.firstName || ev.user?.name || null;
          const cycleMonths = Number(
            ev.subscription?.billingCycleMonths ?? ev.subscriptions?.[0]?.billingCycleMonths ?? 1,
          ) || 1;
          const offer = ev.products?.[0]?.offers?.[0] ?? {};
          const paidStatusAt = Array.isArray(invoice.statusHistory)
            ? invoice.statusHistory.find((s: any) => s?.status === "paid")?.statusAt
            : invoice.status === "paid" ? invoice.statusAt : null;
          const saleRaw = invoice.saleDate ?? paidStatusAt ?? null;
          const saleDate = saleRaw && !isNaN(new Date(saleRaw).getTime())
            ? new Date(saleRaw).toISOString()
            : new Date().toISOString();
          const info: HublaInvoiceInfo = {
            invoiceId,
            subscriptionId: invoice.subscriptionId ?? ev.subscription?.id ?? null,
            amountCents: Number(invoice.amount?.totalCents ?? 0) || 0,
            billingCycleMonths: cycleMonths,
            offerId: offer.id ?? null,
            offerName: offer.name ?? null,
            saleDate,
          };

          const savePending = (reason: string) =>
            sb.from("hubla_pending_payments").upsert(
              {
                email: email || "(sem e-mail)",
                name,
                invoice_id: invoiceId,
                offer_id: info.offerId,
                offer_name: info.offerName,
                amount_cents: info.amountCents,
                sale_date: saleDate,
                payload: body,
                reason,
              },
              { onConflict: "invoice_id" },
            );

          const { data: prof } = email
            ? await sb.from("profiles").select("id").ilike("email", email).limit(1)
            : { data: [] };
          const userId = prof?.[0]?.id as string | undefined;

          if (!userId) {
            await savePending("aluna não encontrada");
            await log(sb, type, "pending", `Aluna não encontrada: ${email}`, { invoiceId, email, sale_date: saleDate });
            return new Response("ok", { status: 200 });
          }

          const { applyHublaRenewal } = await import("@/lib/hubla-renewal.server");
          const res = await applyHublaRenewal(sb, userId, info);
          if (res.status === "no_plan") {
            await savePending("sem plano no Lumma");
            await log(sb, type, "pending", `Sem plano no Lumma: ${email}`, { invoiceId, userId, sale_date: saleDate });
            return new Response("ok", { status: 200 });
          }
          await log(sb, type, "ok", `${res.status} ${email} plano=${res.planType} créditos=${res.creditsStatus}`, {
            invoiceId,
            userId,
            sale_date: res.saleDate,
            period_end_old: res.oldPeriodEnd,
            period_end_new: res.periodEnd,
            credits: res.creditsStatus,
            credits_added: res.creditsAdded,
            status: res.status,
            plan_type: res.planType,
          });
          return new Response("ok", { status: 200 });
        } catch (err: any) {
          console.error("[hubla-webhook]", err?.message);
          // Libera a chave para a Hubla tentar de novo
          const invId = body?.event?.invoice?.id;
          if (invId) await sb.from("stripe_webhook_events").delete().eq("id", `hubla:${type}:${invId}`);
          await log(sb, type, "error", err?.message ?? "erro", { invoiceId: invId });
          return new Response("Erro de processamento", { status: 500 });
        }
      },
    },
  },
});
