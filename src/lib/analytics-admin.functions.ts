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

export const getUsageStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ hours: z.number().int().min(1).max(24 * 400) }).parse(d)
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const since = new Date(Date.now() - data.hours * 3600_000).toISOString();
    const { data: rows, error } = await context.supabase
      .from("usage_hourly_stats")
      .select("hour_bucket, active_users, messages_sent, exams_processed, credits_consumed")
      .gte("hour_bucket", since)
      .order("hour_bucket", { ascending: true });
    if (error) throw new Response(error.message, { status: 500 });
    return { rows: rows ?? [] };
  });
