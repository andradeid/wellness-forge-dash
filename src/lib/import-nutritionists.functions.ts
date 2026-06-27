import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const isoOrNull = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => {
    if (!v) return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  });

const RowSchema = z.object({
  id: z.string().uuid().optional().nullable(),
  email: z.string().email().transform((v) => v.trim().toLowerCase()),
  full_name: z.string().trim().min(1).max(200),
  old_plan: z.string().trim().toLowerCase().default("free"),
  professional_id: z.string().trim().max(80).optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
  clinic_name: z.string().trim().max(200).optional().nullable(),
  subscription_created_at: isoOrNull,
  current_period_end: isoOrNull,
});

const InputSchema = z.object({
  batch: z.string().min(1).max(80),
  rows: z.array(RowSchema).min(1).max(25),
});

type PlanMap = {
  plan_type: "free" | "starter" | "pro" | "clinica";
  status: "trial" | "active";
  balance: number;
  unlimited: boolean;
  tag_label: string;
};

function mapPlan(old: string): PlanMap {
  switch (old) {
    case "black":
    case "pro":
      return { plan_type: "pro", status: "active", balance: 0, unlimited: true, tag_label: "ex-black" };
    case "premium":
    case "basic":
    case "starter":
      return { plan_type: "starter", status: "active", balance: 150, unlimited: false, tag_label: "ex-premium" };
    case "free":
    default:
      return { plan_type: "free", status: "trial", balance: 0, unlimited: false, tag_label: "ex-free" };
  }
}

export const importNutritionistsBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => InputSchema.parse(d))
  .handler(async ({ data, context }) => {
    // Verifica super_admin
    const { data: roleRow } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "super_admin")
      .maybeSingle();
    if (!roleRow) throw new Response("Forbidden", { status: 403 });

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Carrega tags uma vez
    const { data: tagRows } = await (supabaseAdmin as any)
      .from("user_tags")
      .select("id, label")
      .in("label", ["migrado-lumma-1", "ex-black", "ex-premium", "ex-free"]);
    const tagIdByLabel = new Map<string, string>();
    for (const t of tagRows ?? []) tagIdByLabel.set(t.label, t.id);

    const results = {
      created: 0,
      skipped: 0,
      failed: 0,
      details: [] as Array<{ email: string; status: "created" | "skipped" | "failed"; reason?: string }>,
    };

    for (let i = 0; i < data.rows.length; i++) {
      const row = data.rows[i];
      const map = mapPlan(row.old_plan);

      try {
        // 1) Verifica duplicado
        const { data: existing } = await (supabaseAdmin as any)
          .from("profiles")
          .select("id")
          .eq("email", row.email)
          .maybeSingle();
        if (existing) {
          results.skipped++;
          results.details.push({ email: row.email, status: "skipped", reason: "já cadastrado" });
          continue;
        }

        // 2) Cria auth user (preserva id quando válido)
        const randomPass =
          crypto.randomUUID().replace(/-/g, "") + "Aa1!";
        const createPayload: any = {
          email: row.email,
          password: randomPass,
          email_confirm: true,
          user_metadata: { full_name: row.full_name, imported_from: "lumma-1" },
        };
        if (row.id) createPayload.id = row.id;

        const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser(createPayload);
        if (createErr || !created?.user) {
          throw new Error(createErr?.message ?? "auth.createUser falhou");
        }
        const userId = created.user.id;

        // 3) handle_new_user trigger criou profile/subscription/role; ajusta
        await (supabaseAdmin as any)
          .from("profiles")
          .update({
            full_name: row.full_name,
            professional_id: row.professional_id ?? null,
            is_blocked: true,
          })
          .eq("id", userId);

        // 4) Bloqueia no auth também (login impedido)
        await supabaseAdmin.auth.admin.updateUserById(userId, { ban_duration: "876000h" });

        // 3) handle_new_user trigger criou profile/subscription/role; ajusta
        await (supabaseAdmin as any)
          .from("profiles")
          .update({
            full_name: row.full_name,
            professional_id: row.professional_id ?? null,
            phone: row.phone ?? null,
            clinic_name: row.clinic_name ?? null,
            is_blocked: true,
          })
          .eq("id", userId);

        // 4) Bloqueia no auth também (login impedido)
        await supabaseAdmin.auth.admin.updateUserById(userId, { ban_duration: "876000h" });

        // 5) Subscription (preserva datas do Lumma 1.0 quando vierem)
        const subPayload: any = {
          user_id: userId,
          plan_type: map.plan_type,
          status: map.status,
          unlimited_credits: map.unlimited,
        };
        if (row.subscription_created_at) subPayload.created_at = row.subscription_created_at;
        if (row.current_period_end) subPayload.current_period_end = row.current_period_end;

        await (supabaseAdmin as any)
          .from("subscriptions")
          .upsert(subPayload, { onConflict: "user_id" });
              plan_type: map.plan_type,
              status: map.status,
              unlimited_credits: map.unlimited,
            },
            { onConflict: "user_id" },
          );

        // 6) Créditos
        if (map.balance > 0) {
          await (supabaseAdmin as any)
            .from("user_credits")
            .upsert(
              { user_id: userId, balance: map.balance, monthly_quota: map.balance },
              { onConflict: "user_id" },
            );
        }

        // 7) Tags: migrado-lumma-1 + ex-<plano>
        const tagsToApply = [tagIdByLabel.get("migrado-lumma-1"), tagIdByLabel.get(map.tag_label)].filter(
          Boolean,
        ) as string[];
        if (tagsToApply.length) {
          await (supabaseAdmin as any)
            .from("profile_tags")
            .upsert(
              tagsToApply.map((tag_id) => ({ profile_id: userId, tag_id, created_by: context.userId })),
              { onConflict: "profile_id,tag_id", ignoreDuplicates: true },
            );
        }

        results.created++;
        results.details.push({ email: row.email, status: "created" });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        results.failed++;
        results.details.push({ email: row.email, status: "failed", reason: message });
        await (supabaseAdmin as any).from("import_errors").insert({
          import_batch: data.batch,
          row_number: i,
          email: row.email,
          payload: row,
          error_message: message,
          created_by: context.userId,
        });
      }
    }

    return results;
  });
