import { buildLookupResponse, type LookupAccount, type LookupResponse } from "./support-lookup";

const PLAN_LABEL: Record<string, string> = {
  free: "Gratuito",
  starter: "Starter",
  pro: "Pro Individual",
  clinica: "Clínica",
  legado_500: "Legado 500",
};

export const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Lê a conta pelo e-mail (só leitura) e monta o resumo permitido. Registra a consulta. */
export async function lookupAccount(input: { email: string; whatsapp?: string | null; conversa?: string | null; origem?: string | null }): Promise<LookupResponse> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const email = input.email.trim().toLowerCase();
  const safe = email.replace(/[\\%_]/g, (m) => `\\${m}`);

  const { data: profs, error } = await supabaseAdmin
    .from("profiles" as any)
    .select("id, email, phone, is_blocked, deleted_at, must_change_password")
    .ilike("email", safe)
    .limit(2);
  if (error) throw error;

  let acc: LookupAccount | null = null;
  const prof = ((profs as any[]) ?? []).find((p) => String(p.email ?? "").toLowerCase() === email) ?? null;
  if (prof) {
    const [authUser, sub, credits] = await Promise.all([
      supabaseAdmin.auth.admin.getUserById(prof.id),
      supabaseAdmin.from("subscriptions" as any)
        .select("status, plan_type, origin, current_period_end, unlimited_credits").eq("user_id", prof.id).maybeSingle(),
      supabaseAdmin.from("user_credits" as any)
        .select("balance, monthly_quota, pack_balance, quota_reset_at").eq("user_id", prof.id).maybeSingle(),
    ]);
    const s = (sub.data as any) ?? null;
    let planName: string | null = null;
    if (s?.plan_type) {
      const { data: plan } = await supabaseAdmin.from("subscription_plans" as any).select("name").eq("slug", s.plan_type).maybeSingle();
      planName = (plan as any)?.name ?? PLAN_LABEL[s.plan_type] ?? s.plan_type;
    }
    const cr = (credits.data as any) ?? null;
    acc = {
      email,
      phone: prof.phone ?? null,
      isBlocked: !!prof.is_blocked,
      deleted: !!prof.deleted_at,
      lastSignInAt: authUser.data?.user?.last_sign_in_at ?? null,
      mustChangePassword: prof.must_change_password ?? null,
      subscription: s
        ? { status: s.status, planType: s.plan_type, origin: s.origin, currentPeriodEnd: s.current_period_end, unlimitedCredits: s.unlimited_credits }
        : null,
      planName,
      credits: cr ? { balance: cr.balance, monthlyQuota: cr.monthly_quota, packBalance: cr.pack_balance, quotaResetAt: cr.quota_reset_at } : null,
    };
  }

  const res = buildLookupResponse(acc, input.whatsapp ?? null);

  // Registro para conferência (quem consultou o quê). Falha no registro não derruba a consulta.
  await supabaseAdmin.from("support_lookup_logs" as any).insert({
    email,
    found: res.encontrada,
    phone_match: res.telefone_confere ?? false,
    detail_returned: res.situacao !== undefined,
    whatsapp: input.whatsapp ? String(input.whatsapp).replace(/\D/g, "").slice(-13) : null,
    conversation_ref: input.conversa ? String(input.conversa).slice(0, 100) : null,
    source: input.origem ? String(input.origem).slice(0, 50) : null,
  }).then(({ error: e }: any) => { if (e) console.warn("[support-lookup] log:", e.message); });

  return res;
}
