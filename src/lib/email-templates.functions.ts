import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertSuperAdmin(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "super_admin");
  if (!data || data.length === 0) {
    throw new Response("Forbidden: super_admin only", { status: 403 });
  }
}

export const listEmailTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("email_templates" as any)
      .select("*")
      .order("category", { ascending: true })
      .order("name", { ascending: true });
    if (error) throw new Response(error.message, { status: 500 });
    return data ?? [];
  });

export const updateEmailTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        subject: z.string().min(1).max(300),
        html: z.string().min(10).max(200_000),
        is_active: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("email_templates" as any)
      .update({
        subject: data.subject,
        html: data.html,
        is_active: data.is_active ?? undefined,
        updated_by: context.userId,
      })
      .eq("id", data.id);
    if (error) throw new Response(error.message, { status: 500 });
    return { ok: true };
  });

/** Envia um e-mail de teste do template para qualquer endereço, com variáveis fake. */
export const sendTestEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        templateId: z.string().uuid(),
        to: z.string().email(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { data: tpl, error } = await context.supabase
      .from("email_templates" as any)
      .select("*")
      .eq("id", data.templateId)
      .maybeSingle();
    if (error || !tpl) throw new Response("Template não encontrado", { status: 404 });

    const fake: Record<string, string> = {
      first_name_comma: ", Ana",
      credits: "150",
      balance_after: "312",
      amount: "R$ 47,00",
      dashboard_url: "https://lumma.ia.br/app",
      plan_name: "Pro",
      cycle_label: "mensal",
      next_renewal: "20/08/2026",
      ".ConfirmationURL": "https://lumma.ia.br/reset-password?token=exemplo",
      ".Email": "usuario@exemplo.com",
      ".NewEmail": "novo@exemplo.com",
    };

    const html = renderTemplate((tpl as any).html, fake);
    const subject = `[TESTE] ${renderTemplate((tpl as any).subject, fake)}`;

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Response("RESEND_API_KEY não configurada no servidor", { status: 500 });
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: "Lumma <no-reply@lumma.ia.br>",
        to: data.to,
        subject,
        html,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Response(`Falha ao enviar: ${res.status} ${text}`, { status: 500 });
    }
    return { ok: true };
  });

function renderTemplate(source: string, vars: Record<string, string>) {
  let out = source;
  for (const [k, v] of Object.entries(vars)) {
    // {{ .Var }}  |  {{.Var}}  |  {{var}}
    const re = new RegExp(`\\{\\{\\s*${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\}\\}`, "g");
    out = out.replace(re, v);
  }
  return out;
}
