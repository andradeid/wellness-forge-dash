import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Saldo + situação da assinatura do usuário autenticado. */
export const getMyCredits = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("user_credits" as any)
      .select("balance, monthly_quota, quota_reset_at")
      .eq("user_id", context.userId)
      .maybeSingle();
    const { data: sub } = await context.supabase
      .from("subscriptions" as any)
      .select("unlimited_credits, status, plan_type, current_period_end")
      .eq("user_id", context.userId)
      .maybeSingle();
    const { data: active } = await context.supabase.rpc(
      "subscription_is_active" as any,
      { _user_id: context.userId },
    );

    const row = (data as any) ?? null;
    const s = (sub as any) ?? null;
    return {
      balance: row?.balance ?? 0,
      monthly_quota: row?.monthly_quota ?? 0,
      quota_reset_at: row?.quota_reset_at ?? null,
      unlimited: !!s?.unlimited_credits,
      /** Falso = assinatura vencida/cancelada: leitura liberada, consumo bloqueado. */
      subscriptionActive: active === null || active === undefined ? true : Boolean(active),
      currentPeriodEnd: (s?.current_period_end as string | null) ?? null,
      planType: (s?.plan_type as string | null) ?? null,
    };
  });

/** Custo de um agente (0 se inexistente/inativo). */
export const getAgentCost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ agentKey: z.string().min(1).max(80) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("agent_costs" as any)
      .select("cost_credits, display_name, is_active")
      .eq("agent_key", data.agentKey)
      .maybeSingle();
    const r = (row as any) ?? null;
    if (!r || !r.is_active) return { cost: 0, label: null as string | null };
    return { cost: r.cost_credits as number, label: r.display_name as string };
  });

/** Debita créditos via RPC atômica do banco. */
export const consumeCredits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      agentKey: z.string().min(1).max(80),
      messagePreview: z.string().max(200).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("consume_credits" as any, {
      p_user_id: context.userId,
      p_agent_key: data.agentKey,
      p_message_preview: data.messagePreview ?? null,
    });
    if (error) throw new Response(error.message, { status: 500 });
    const r = (result as any) ?? null;
    // Compatibilidade: versões antigas da RPC retornavam boolean puro.
    if (typeof r === "boolean") return { ok: r, reason: r ? null : "insufficient" };
    return {
      ok: Boolean(r?.ok),
      reason: (r?.reason as string | null) ?? null,
      cost: (r?.cost as number | undefined) ?? 0,
    };
  });
