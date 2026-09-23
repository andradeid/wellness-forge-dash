import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any, userId: string) {
  // Suporte (CS) também pode resetar senha / reenviar acesso.
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "super_admin", "support"]);
  if (!data || data.length === 0) {
    throw new Response("Forbidden", { status: 403 });
  }
}

type ResendResult = { user_id: string; email: string | null; ok: boolean; error?: string };

/**
 * Reseta a senha para a temporária, marca must_change_password e envia o
 * e-mail de boas-vindas. O envio fica registrado em integration_logs.
 */
async function resendAccessFor(
  userId: string,
  actorId: string,
  trigger: string,
): Promise<ResendResult> {
  const { TEMP_PASSWORD } = await import("@/lib/user-provisioning.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { sendWelcomeNewPurchaseEmail } = await import("@/lib/emails.server");

  const { data: prof } = await supabaseAdmin
    .from("profiles" as any)
    .select("id, email, full_name")
    .eq("id", userId)
    .maybeSingle();
  if (!prof) return { user_id: userId, email: null, ok: false, error: "Usuário não encontrado" };
  const email = (prof as any).email as string;

  const { data: sub } = await supabaseAdmin
    .from("subscriptions" as any)
    .select("plan_type")
    .eq("user_id", userId)
    .maybeSingle();

  let planName = "Lumma";
  let credits = 0;
  if ((sub as any)?.plan_type) {
    const { data: plan } = await supabaseAdmin
      .from("subscription_plans" as any)
      .select("name, monthly_credits")
      .eq("slug", (sub as any).plan_type)
      .maybeSingle();
    planName = (plan as any)?.name ?? (sub as any).plan_type;
    credits = Number((plan as any)?.monthly_credits ?? 0);
  }
  const { data: uc } = await supabaseAdmin
    .from("user_credits" as any)
    .select("balance")
    .eq("user_id", userId)
    .maybeSingle();
  if ((uc as any)?.balance != null) credits = Number((uc as any).balance);

  const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    password: TEMP_PASSWORD,
    email_confirm: true,
  });
  if (updErr) return { user_id: userId, email, ok: false, error: updErr.message };

  await supabaseAdmin
    .from("profiles" as any)
    .update({ must_change_password: true })
    .eq("id", userId);

  const sent = await sendWelcomeNewPurchaseEmail({
    userId,
    email,
    fullName: (prof as any).full_name,
    tempPassword: TEMP_PASSWORD,
    planName,
    credits,
    trigger,
    actorId,
  });

  await supabaseAdmin.from("integration_logs" as any).insert({
    source: "admin-welcome",
    event: "manual_password_reset",
    status: sent.ok ? "success" : "error",
    message: `Reenvio de acesso (${trigger}) por ${actorId}`,
    payload: { target_user_id: userId, performed_by: actorId, email },
  });

  return sent.ok
    ? { user_id: userId, email, ok: true }
    : { user_id: userId, email, ok: false, error: String((sent as any).error ?? "falha no envio") };
}

/** Botão individual "Enviar boas-vindas / Reset" e pós-criação manual. */
export const adminSendWelcomeReset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ user_id: z.string().uuid(), trigger: z.string().max(40).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const r = await resendAccessFor(data.user_id, context.userId, data.trigger ?? "admin_resend");
    if (!r.ok) throw new Error(r.error ?? "Falha ao enviar boas-vindas");
    return { ok: true, email: r.email as string };
  });

/** Reenvio de acesso em lote (até 100 contas por vez). */
export const adminResendAccessBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ user_ids: z.array(z.string().uuid()).min(1).max(100) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const results: ResendResult[] = [];
    for (const id of Array.from(new Set(data.user_ids))) {
      try {
        results.push(await resendAccessFor(id, context.userId, "admin_resend_batch"));
      } catch (e: any) {
        results.push({ user_id: id, email: null, ok: false, error: e?.message ?? "erro" });
      }
    }
    return {
      sent: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok),
    };
  });
