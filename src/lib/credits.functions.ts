import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Saldo do usuário autenticado. */
export const getMyCredits = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("user_credits" as any)
      .select("balance, monthly_quota, quota_reset_at")
      .eq("user_id", context.userId)
      .maybeSingle();
    const row = (data as any) ?? null;
    return {
      balance: row?.balance ?? 0,
      monthly_quota: row?.monthly_quota ?? 0,
      quota_reset_at: row?.quota_reset_at ?? null,
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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: ok, error } = await supabaseAdmin.rpc("consume_credits" as any, {
      p_user_id: context.userId,
      p_agent_key: data.agentKey,
      p_message_preview: data.messagePreview ?? null,
    });
    if (error) throw new Response(error.message, { status: 500 });
    return { ok: Boolean(ok) };
  });
