/**
 * Envio de emails transacionais via Resend.
 * Templates lidos da tabela email_templates (editáveis pelo super_admin).
 * Só é importado por código server-side (webhooks, server functions).
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const FROM = "Lumma <no-reply@lumma.ia.br>";
const DASHBOARD_URL = "https://lumma.ia.br/app";

function brl(cents: number, currency = "brl") {
  const value = (cents ?? 0) / 100;
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(value);
}

function renderTemplate(source: string, vars: Record<string, string>) {
  let out = source;
  for (const [k, v] of Object.entries(vars)) {
    const re = new RegExp(
      `\\{\\{\\s*${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\}\\}`,
      "g",
    );
    out = out.replace(re, v);
  }
  return out;
}

async function loadTemplate(key: string): Promise<{ subject: string; html: string } | null> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("email_templates" as any)
      .select("subject, html, is_active")
      .eq("key", key)
      .maybeSingle();
    if (error || !data) return null;
    if ((data as any).is_active === false) return null;
    return { subject: (data as any).subject, html: (data as any).html };
  } catch (err: any) {
    console.error("[emails] falha ao carregar template", key, err?.message);
    return null;
  }
}

async function sendEmail(args: { to: string; subject: string; html: string }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[emails] RESEND_API_KEY não configurada — pulando envio");
    return { ok: false, skipped: true };
  }
  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ from: FROM, to: args.to, subject: args.subject, html: args.html }),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error("[emails] resend falhou:", res.status, text);
      return { ok: false, error: text };
    }
    return { ok: true };
  } catch (err: any) {
    console.error("[emails] erro rede resend:", err?.message);
    return { ok: false, error: err?.message };
  }
}

async function resolveUserEmail(
  userId: string,
): Promise<{ email: string | null; name: string | null }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (error || !data?.user) return { email: null, name: null };
  const email = data.user.email ?? null;
  const name =
    (data.user.user_metadata?.full_name as string | undefined) ??
    (data.user.user_metadata?.name as string | undefined) ??
    null;
  return { email, name };
}

/** Email pós-compra de pacote avulso. */
export async function sendPackPurchaseEmail(args: {
  userId: string;
  credits: number;
  amountCents: number;
  currency: string;
  balanceAfter: number;
}) {
  const { email, name } = await resolveUserEmail(args.userId);
  if (!email) return { ok: false, error: "email não encontrado" };
  const tpl = await loadTemplate("pack_purchase");
  if (!tpl) return { ok: false, error: "template pack_purchase inativo ou não encontrado" };

  const firstName = name?.split(" ")[0] ?? "";
  const vars: Record<string, string> = {
    first_name_comma: firstName ? `, ${firstName}` : "",
    credits: String(args.credits),
    balance_after: String(args.balanceAfter),
    amount: brl(args.amountCents, args.currency),
    dashboard_url: DASHBOARD_URL,
  };

  return sendEmail({
    to: email,
    subject: renderTemplate(tpl.subject, vars),
    html: renderTemplate(tpl.html, vars),
  });
}

/** Email pós-ativação de assinatura (só na primeira fatura paga). */
export async function sendSubscriptionActivatedEmail(args: {
  userId: string;
  planName: string;
  credits: number;
  amountCents: number;
  currency: string;
  billingCycle: "monthly" | "yearly";
  nextRenewalIso: string | null;
}) {
  const { email, name } = await resolveUserEmail(args.userId);
  if (!email) return { ok: false, error: "email não encontrado" };
  const tpl = await loadTemplate("subscription_activated");
  if (!tpl)
    return { ok: false, error: "template subscription_activated inativo ou não encontrado" };

  const firstName = name?.split(" ")[0] ?? "";
  const cycleLabel = args.billingCycle === "yearly" ? "anual" : "mensal";
  const nextRenewal = args.nextRenewalIso
    ? new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }).format(new Date(args.nextRenewalIso))
    : "—";

  const vars: Record<string, string> = {
    first_name_comma: firstName ? `, ${firstName}` : "",
    plan_name: args.planName,
    credits: String(args.credits),
    cycle_label: cycleLabel,
    amount: brl(args.amountCents, args.currency),
    next_renewal: nextRenewal,
    dashboard_url: DASHBOARD_URL,
  };

  return sendEmail({
    to: email,
    subject: renderTemplate(tpl.subject, vars),
    html: renderTemplate(tpl.html, vars),
  });
}
