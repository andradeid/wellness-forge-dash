/**
 * Envio de emails transacionais via Resend.
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

function baseTemplate(opts: {
  title: string;
  intro: string;
  highlight: string;
  details: Array<{ label: string; value: string }>;
  ctaLabel: string;
  ctaUrl: string;
  footer?: string;
}) {
  const detailRows = opts.details
    .map(
      (d) => `
      <tr>
        <td style="padding:8px 0;color:#6b7280;font-size:14px;">${d.label}</td>
        <td style="padding:8px 0;color:#111827;font-size:14px;text-align:right;font-weight:600;">${d.value}</td>
      </tr>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><title>${opts.title}</title></head>
<body style="margin:0;padding:0;background:#f5f5f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f4;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.06);">
        <tr><td style="background:linear-gradient(135deg,#e8a04c 0%,#e89bcf 100%);padding:32px 32px 24px;color:#fff;">
          <div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;opacity:0.9;">Lumma</div>
          <h1 style="margin:8px 0 0;font-size:24px;font-weight:600;">${opts.title}</h1>
        </td></tr>
        <tr><td style="padding:32px;">
          <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">${opts.intro}</p>
          <div style="background:#fef3e2;border-left:4px solid #e8a04c;padding:16px;border-radius:8px;margin:16px 0;">
            <div style="color:#78350f;font-size:15px;font-weight:600;">${opts.highlight}</div>
          </div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border-top:1px solid #e5e7eb;">
            ${detailRows}
          </table>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0 8px;">
            <tr><td align="center">
              <a href="${opts.ctaUrl}" style="display:inline-block;background:linear-gradient(135deg,#e8a04c 0%,#e89bcf 100%);color:#fff;text-decoration:none;padding:14px 32px;border-radius:9999px;font-weight:600;font-size:15px;">${opts.ctaLabel}</a>
            </td></tr>
          </table>
          <p style="margin:24px 0 0;color:#6b7280;font-size:13px;line-height:1.6;">${opts.footer ?? "Se precisar de ajuda, é só responder este email ou falar com a gente pelo WhatsApp."}</p>
        </td></tr>
        <tr><td style="background:#fafaf9;padding:16px 32px;text-align:center;color:#9ca3af;font-size:12px;">
          Lumma · Inteligência para Nutricionistas · lumma.ia.br
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
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

async function resolveUserEmail(userId: string): Promise<{ email: string | null; name: string | null }> {
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

  const firstName = name?.split(" ")[0] ?? "";
  const html = baseTemplate({
    title: "Créditos adicionados! ✨",
    intro: `Olá${firstName ? `, ${firstName}` : ""}! Recebemos sua compra e seus créditos já estão disponíveis para usar com a Lumma.`,
    highlight: `+${args.credits} créditos adicionados à sua conta`,
    details: [
      { label: "Créditos comprados", value: `${args.credits}` },
      { label: "Saldo atual", value: `${args.balanceAfter} créditos` },
      { label: "Valor pago", value: brl(args.amountCents, args.currency) },
    ],
    ctaLabel: "Acessar dashboard",
    ctaUrl: DASHBOARD_URL,
  });

  return sendEmail({
    to: email,
    subject: `Obrigada! ${args.credits} créditos adicionados 🎉`,
    html,
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

  const firstName = name?.split(" ")[0] ?? "";
  const cycleLabel = args.billingCycle === "yearly" ? "anual" : "mensal";
  const nextRenewal = args.nextRenewalIso
    ? new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(
        new Date(args.nextRenewalIso),
      )
    : "—";

  const html = baseTemplate({
    title: `Bem-vinda ao plano ${args.planName}! 🌱`,
    intro: `Olá${firstName ? `, ${firstName}` : ""}! Sua assinatura Lumma ${args.planName} está ativa. Preparamos tudo para você começar agora.`,
    highlight: `${args.credits} créditos disponíveis no seu plano`,
    details: [
      { label: "Plano", value: `${args.planName} (${cycleLabel})` },
      { label: "Créditos", value: `${args.credits} / mês` },
      { label: "Valor pago", value: brl(args.amountCents, args.currency) },
      { label: "Próxima renovação", value: nextRenewal },
    ],
    ctaLabel: "Ir para o dashboard",
    ctaUrl: DASHBOARD_URL,
    footer:
      "Você pode gerenciar sua assinatura, ver histórico de pagamentos e comprar créditos extras diretamente na área Planos & Créditos.",
  });

  return sendEmail({
    to: email,
    subject: `Sua assinatura Lumma ${args.planName} está ativa 🎉`,
    html,
  });
}
