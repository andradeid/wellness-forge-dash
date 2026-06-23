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
      cursorCreatedAt: z.string().nullish(),
      cursorId: z.string().uuid().nullish(),
      limit: z.number().int().min(1).max(100).default(25),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    let q = context.supabase
      .from("credit_transactions")
      .select("id, created_at, agent_key, agent_label, type, amount, balance_after, message_preview, metadata")
      .eq("user_id", data.userId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(data.limit);
    if (data.cursorCreatedAt && data.cursorId) {
      q = q.or(`created_at.lt.${data.cursorCreatedAt},and(created_at.eq.${data.cursorCreatedAt},id.lt.${data.cursorId})`);
    }
    const { data: rows, error } = await q;
    if (error) throw new Response(error.message, { status: 500 });

    // Resolve admin names for manual adjustments (metadata.by)
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
    return (rows ?? []).map((r: any) => ({
      ...r,
      by_admin: r?.metadata?.by ? nameById[r.metadata.by] ?? null : null,
    }));
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

    const { data: existing } = await context.supabase
      .from("user_credits")
      .select("balance")
      .eq("user_id", data.userId)
      .maybeSingle();
    const current = existing?.balance ?? 0;
    const next = current + data.delta;
    if (next < 0) throw new Response("Saldo ficaria negativo", { status: 400 });

    if (existing) {
      const { error } = await context.supabase
        .from("user_credits")
        .update({ balance: next, updated_at: new Date().toISOString() })
        .eq("user_id", data.userId);
      if (error) throw new Response(error.message, { status: 500 });
    } else {
      const { error } = await context.supabase
        .from("user_credits")
        .insert({ user_id: data.userId, balance: next });
      if (error) throw new Response(error.message, { status: 500 });
    }

    const { error: txErr } = await context.supabase.from("credit_transactions").insert({
      user_id: data.userId,
      type: data.delta > 0 ? "grant" : "debit",
      amount: Math.abs(data.delta),
      balance_after: next,
      message_preview: `[Ajuste manual] ${data.reason}`,
      metadata: { manual: true, by: context.userId, reason: data.reason },
    });
    if (txErr) throw new Response(txErr.message, { status: 500 });

    return { balance: next };
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

    // Ensure a subscriptions row exists, then update flag
    const { data: sub } = await context.supabase
      .from("subscriptions")
      .select("id, unlimited_credits")
      .eq("user_id", data.userId)
      .maybeSingle();

    if (sub) {
      const { error } = await context.supabase
        .from("subscriptions")
        .update({ unlimited_credits: data.unlimited })
        .eq("user_id", data.userId);
      if (error) throw new Response(error.message, { status: 500 });
    } else {
      const { error } = await context.supabase
        .from("subscriptions")
        .insert({
          user_id: data.userId,
          status: "active",
          plan_type: "free",
          unlimited_credits: data.unlimited,
        });
      if (error) throw new Response(error.message, { status: 500 });
    }

    // Audit log — registra como uma transação tipo grant com amount 0
    const { data: bal } = await context.supabase
      .from("user_credits")
      .select("balance")
      .eq("user_id", data.userId)
      .maybeSingle();
    const current = bal?.balance ?? 0;
    await context.supabase.from("credit_transactions").insert({
      user_id: data.userId,
      type: "grant",
      amount: 0,
      balance_after: current,
      message_preview: `[${data.unlimited ? "Ativou" : "Desativou"} ilimitado] ${data.reason}`,
      metadata: {
        manual: true,
        unlimited_toggle: true,
        new_value: data.unlimited,
        by: context.userId,
        reason: data.reason,
      },
    });

    return { unlimited_credits: data.unlimited };
  });
