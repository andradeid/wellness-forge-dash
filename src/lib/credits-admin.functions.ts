import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "super_admin"]);
  if (!data || data.length === 0) throw new Response("Forbidden", { status: 403 });
}

async function assertSuperAdmin(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "super_admin");
  if (!data || data.length === 0) throw new Response("Forbidden: super_admin only", { status: 403 });
}

export const findUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ q: z.string().trim().min(1).max(120) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const q = data.q;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(q);
    const query = context.supabase
      .from("profiles")
      .select("id, full_name, email")
      .limit(20);
    const { data: rows, error } = isUuid
      ? await query.eq("id", q)
      : await query.ilike("email", `%${q}%`);
    if (error) throw new Response(error.message, { status: 500 });
    return rows ?? [];
  });

export const listNutritionists = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      q: z.string().trim().max(120).optional().default(""),
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(100).default(25),
    }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);

    const { data: adminRoleRows, error: rErr } = await context.supabase
      .from("user_roles")
      .select("user_id")
      .in("role", ["admin", "super_admin"]);
    if (rErr) throw new Response(rErr.message, { status: 500 });

    const adminIds = Array.from(new Set((adminRoleRows ?? []).map((r: any) => r.user_id as string)));
    const from = (data.page - 1) * data.pageSize;
    const to = from + data.pageSize - 1;

    let profilesQuery = context.supabase
      .from("profiles")
      .select("id, full_name, email", { count: "exact" })
      .is("deleted_at", null);

    if (adminIds.length > 0) {
      profilesQuery = profilesQuery.not("id", "in", `(${adminIds.join(",")})`);
    }
    if (data.q) {
      const term = `%${data.q}%`;
      profilesQuery = profilesQuery.or(`full_name.ilike.${term},email.ilike.${term}`);
    }

    const profilesRes = await profilesQuery
      .order("full_name", { ascending: true, nullsFirst: false })
      .range(from, to);
    if (profilesRes.error) throw new Response(profilesRes.error.message, { status: 500 });

    const pageIds = (profilesRes.data ?? []).map((p: any) => p.id);
    let subsRes: any = { data: [] };
    let creditsRes: any = { data: [] };
    if (pageIds.length > 0) {
      [subsRes, creditsRes] = await Promise.all([
        context.supabase
          .from("subscriptions")
          .select("user_id, plan_type, unlimited_credits")
          .in("user_id", pageIds),
        context.supabase
          .from("user_credits")
          .select("user_id, balance")
          .in("user_id", pageIds),
      ]);
      if (subsRes.error) throw new Response(subsRes.error.message, { status: 500 });
      if (creditsRes.error) throw new Response(creditsRes.error.message, { status: 500 });
    }

    const subById = new Map<string, { plan_type: string | null; unlimited_credits: boolean }>();
    for (const s of subsRes.data ?? []) {
      subById.set(s.user_id, { plan_type: s.plan_type, unlimited_credits: !!s.unlimited_credits });
    }
    const balById = new Map<string, number>();
    for (const c of creditsRes.data ?? []) {
      balById.set(c.user_id, c.balance ?? 0);
    }
    const rows = (profilesRes.data ?? []).map((p: any) => {
      const sub = subById.get(p.id);
      const unlimited = !!sub?.unlimited_credits;
      return {
        ...p,
        plan_type: unlimited ? "ilimitado" : sub?.plan_type ?? "free",
        unlimited_credits: unlimited,
        balance: balById.get(p.id) ?? 0,
      };
    });
    return { rows, total: profilesRes.count ?? 0, page: data.page, pageSize: data.pageSize };
  });


export const getUserCredits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: row } = await context.supabase
      .from("user_credits")
      .select("balance, monthly_quota, quota_reset_at, updated_at")
      .eq("user_id", data.userId)
      .maybeSingle();
    const { data: sub } = await context.supabase
      .from("subscriptions")
      .select("unlimited_credits")
      .eq("user_id", data.userId)
      .maybeSingle();
    return {
      ...(row ?? { balance: 0, monthly_quota: 0, quota_reset_at: null, updated_at: null }),
      unlimited_credits: !!sub?.unlimited_credits,
    };
  });

export const listTransactions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      userId: z.string().uuid(),
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(100).default(25),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const from = (data.page - 1) * data.pageSize;
    const to = from + data.pageSize - 1;
    const { data: rows, error, count } = await context.supabase
      .from("credit_transactions")
      .select(
        "id, created_at, agent_key, agent_label, type, amount, balance_after, message_preview, metadata",
        { count: "exact" },
      )
      .eq("user_id", data.userId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to);
    if (error) throw new Response(error.message, { status: 500 });

    const ids = Array.from(
      new Set(
        (rows ?? [])
          .map((r: any) => r?.metadata?.by)
          .filter((v: any) => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v)),
      ),
    );
    let nameById: Record<string, { full_name: string | null; email: string }> = {};
    if (ids.length) {
      const { data: profs } = await context.supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", ids);
      for (const p of profs ?? []) {
        nameById[p.id] = { full_name: p.full_name, email: p.email };
      }
    }
    return {
      rows: (rows ?? []).map((r: any) => ({
        ...r,
        by_admin: r?.metadata?.by ? nameById[r.metadata.by] ?? null : null,
      })),
      total: count ?? 0,
      page: data.page,
      pageSize: data.pageSize,
    };
  });


export const adjustBalance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      userId: z.string().uuid(),
      delta: z.number().int().refine((v) => v !== 0, "delta != 0"),
      reason: z.string().trim().min(3).max(500),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);

    const { data: balance, error } = await context.supabase.rpc("adjust_user_balance", {
      p_user_id: data.userId,
      p_delta: data.delta,
      p_admin_id: context.userId,
      p_reason: data.reason,
    });
    if (error) throw new Response(error.message, { status: 400 });
    return { balance: balance as number };
  });

export const setUnlimited = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      userId: z.string().uuid(),
      unlimited: z.boolean(),
      reason: z.string().trim().min(3).max(500),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);

    const { error } = await context.supabase.rpc("toggle_unlimited_credits", {
      p_user_id: data.userId,
      p_unlimited: data.unlimited,
      p_admin_id: context.userId,
      p_reason: data.reason,
    });
    if (error) throw new Response(error.message, { status: 400 });
    return { unlimited_credits: data.unlimited };
  });

/**
 * Troca o plano de um usuário pelo painel admin E provisiona os créditos do plano.
 *
 * Antes, a tela só atualizava `subscriptions.plan_type` — o saldo continuava zerado,
 * obrigando o suporte a trocar de plano e voltar. Aqui, além do plano:
 *  - grava a cota mensal do plano em `user_credits.monthly_quota`
 *  - completa o saldo até a cota quando estiver abaixo (nunca reduz saldo existente)
 *  - registra a diferença em `credit_transactions` para o extrato do usuário
 * Planos sem crédito (free) ou assinaturas inativas não recebem carga.
 */
export const setUserPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      userId: z.string().uuid(),
      planType: z.enum(["free", "starter", "pro", "clinica", "legado_500"]),
      status: z.enum(["trial", "active", "past_due", "canceled"]),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);

    const { error: subErr } = await context.supabase
      .from("subscriptions")
      .update({ plan_type: data.planType, status: data.status })
      .eq("user_id", data.userId);
    if (subErr) throw new Response(subErr.message, { status: 400 });

    // Cota do plano escolhido
    const { data: plan } = await context.supabase
      .from("subscription_plans")
      .select("monthly_credits, name")
      .eq("slug", data.planType)
      .maybeSingle();

    const monthlyCredits = (plan as any)?.monthly_credits ?? 0;
    const planActive = data.status === "active" || data.status === "trial";

    if (!planActive || monthlyCredits <= 0) {
      return { plan_type: data.planType, status: data.status, credited: 0, balance: null };
    }

    const { data: creditsRow } = await context.supabase
      .from("user_credits")
      .select("balance, quota_reset_at")
      .eq("user_id", data.userId)
      .maybeSingle();

    const balanceBefore = (creditsRow as any)?.balance ?? 0;
    const balanceAfter = Math.max(balanceBefore, monthlyCredits);
    const credited = balanceAfter - balanceBefore;

    const nextReset = new Date();
    nextReset.setMonth(nextReset.getMonth() + 1);

    const { error: upErr } = await context.supabase
      .from("user_credits")
      .upsert(
        {
          user_id: data.userId,
          balance: balanceAfter,
          monthly_quota: monthlyCredits,
          quota_reset_at: (creditsRow as any)?.quota_reset_at ?? nextReset.toISOString(),
        },
        { onConflict: "user_id" },
      );
    if (upErr) throw new Response(upErr.message, { status: 400 });

    if (credited > 0) {
      await context.supabase.from("credit_transactions").insert({
        user_id: data.userId,
        type: "grant",
        amount: credited,
        balance_after: balanceAfter,
        agent_key: null,
        agent_label: `plano:${data.planType}`,
        message_preview: `Créditos do plano ${(plan as any)?.name ?? data.planType} liberados pelo suporte`,
        metadata: { source: "admin_set_plan", plan: data.planType, admin_id: context.userId },
      } as any);
    }

    return { plan_type: data.planType, status: data.status, credited, balance: balanceAfter };
  });

