import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "super_admin"]);
  if (!data || data.length === 0) {
    throw new Response("Forbidden", { status: 403 });
  }
}

/**
 * Reseta a senha do usuário para a temporária (`Lumma2@102030`), marca
 * must_change_password=true e dispara o email de boas-vindas com as
 * credenciais. Usado pelo botão "Enviar boas-vindas / Reset" no admin.
 *
 * Segurança: se o usuário já logou alguma vez, também sobrescreve a senha —
 * a ação é iniciada manualmente pelo admin (não é fluxo automático).
 */
export const adminSendWelcomeReset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ user_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);

    const { TEMP_PASSWORD } = await import("@/lib/user-provisioning.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendWelcomeNewPurchaseEmail } = await import("@/lib/emails.server");

    // Perfil + plano/créditos para compor o email
    const { data: prof, error: profErr } = await supabaseAdmin
      .from("profiles" as any)
      .select("id, email, full_name")
      .eq("id", data.user_id)
      .maybeSingle();
    if (profErr || !prof) {
      throw new Response("Usuário não encontrado", { status: 404 });
    }

    const { data: sub } = await supabaseAdmin
      .from("subscriptions" as any)
      .select("plan_type")
      .eq("user_id", data.user_id)
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
      .eq("user_id", data.user_id)
      .maybeSingle();
    if ((uc as any)?.balance != null) credits = Number((uc as any).balance);

    // Reseta senha + confirma email
    const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(
      data.user_id,
      { password: TEMP_PASSWORD, email_confirm: true },
    );
    if (updErr) throw new Response(updErr.message, { status: 500 });

    await supabaseAdmin
      .from("profiles" as any)
      .update({ must_change_password: true })
      .eq("id", data.user_id);

    await sendWelcomeNewPurchaseEmail({
      userId: data.user_id,
      email: (prof as any).email,
      fullName: (prof as any).full_name,
      tempPassword: TEMP_PASSWORD,
      planName,
      credits,
    });

    return { ok: true, email: (prof as any).email as string };
  });
