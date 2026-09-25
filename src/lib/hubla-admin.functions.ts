import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertSuperAdmin(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "super_admin");
  if (!data || data.length === 0) throw new Response("Forbidden", { status: 403 });
}

export const getHublaOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const sb = supabaseAdmin as any;
    const [{ data: last }, { data: pending }] = await Promise.all([
      sb.from("integration_logs").select("created_at, event, status, message")
        .eq("source", "hubla").order("created_at", { ascending: false }).limit(1),
      sb.from("hubla_pending_payments")
        .select("id, email, name, invoice_id, offer_name, reason, amount_cents, sale_date, received_at")
        .eq("resolved", false).order("received_at", { ascending: false }).limit(200),
    ]);
    return {
      lastEvent: (last?.[0] ?? null) as
        | { created_at: string; event: string; status: string; message: string | null }
        | null,
      pending: (pending ?? []) as Array<{
        id: string; email: string; name: string | null; invoice_id: string;
        offer_name: string | null; reason: string | null; amount_cents: number | null;
        sale_date: string | null; received_at: string;
      }>,
    };
  });

export const searchHublaUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ q: z.string().trim().min(2).max(120) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const q = data.q.replace(/[%,()]/g, "");
    const { data: rows } = await (supabaseAdmin as any)
      .from("profiles").select("id, email, full_name")
      .or(`email.ilike.%${q}%,full_name.ilike.%${q}%`).limit(10);
    return (rows ?? []) as Array<{ id: string; email: string | null; full_name: string | null }>;
  });

export const linkHublaPending = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      pendingId: z.string().uuid(),
      userId: z.string().uuid(),
      planType: z.enum(["free", "starter", "pro", "clinica", "legado_500"]).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const sb = supabaseAdmin as any;
    const { data: p } = await sb.from("hubla_pending_payments").select("*")
      .eq("id", data.pendingId).maybeSingle();
    if (!p) throw new Error("Pendência não encontrada");
    if (p.resolved) throw new Error("Pendência já vinculada");
    const ev = p.payload?.event ?? {};
    const { applyHublaRenewal } = await import("@/lib/hubla-renewal.server");
    const res = await applyHublaRenewal(sb, data.userId, {
      invoiceId: p.invoice_id,
      subscriptionId: ev.invoice?.subscriptionId ?? ev.subscription?.id ?? null,
      amountCents: p.amount_cents ?? 0,
      billingCycleMonths: Number(
        ev.subscription?.billingCycleMonths ?? ev.subscriptions?.[0]?.billingCycleMonths ?? 1,
      ) || 1,
      offerId: p.offer_id,
      offerName: p.offer_name,
      saleDate: p.sale_date ? new Date(p.sale_date).toISOString() : new Date().toISOString(),
    }, { planOverride: data.planType });
    if (res.status === "no_plan") {
      throw new Error("Esta aluna não tem plano no Lumma. Escolha o plano antes de vincular.");
    }
    await sb.from("hubla_pending_payments").update({
      resolved: true, resolved_user_id: data.userId,
      resolved_by: context.userId, resolved_at: new Date().toISOString(),
    }).eq("id", data.pendingId);
    await sb.from("integration_logs").insert({
      source: "hubla", event: "manual_link", status: "ok",
      message: `Pendência ${p.invoice_id} vinculada (${res.status})`,
      payload: { pendingId: data.pendingId, userId: data.userId, adminId: context.userId, ...res },
    });
    return res;
  });
