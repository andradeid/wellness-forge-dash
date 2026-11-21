/**
 * Trava de segurança da IA.
 *
 * Quando o provedor de IA (OpenAI/Anthropic) fica sem crédito, nenhuma
 * análise funciona. Caso real: 20/11/2026 19h → 21/11 09h, 423 falhas em 72
 * nutricionistas sem ninguém da equipe saber.
 *
 * A regra fica no banco (função trip_ai_maintenance_if_needed): 3+ falhas de
 * "sem crédito" em 10 min, de 2+ nutricionistas, fora do agente de Pesquisa.
 * Ao disparar, liga o modo manutenção (system_settings.maintenance_enabled) e
 * manda um e-mail para os super_admin. Desligar é manual, no admin
 * (Sistema → Manutenção), depois de recarregar o crédito.
 */

let lastCheck = 0;

/** Nunca lança. Retorna o motivo quando acabou de ligar a manutenção. */
export async function tripAiMaintenanceIfNeeded(rawError?: string | null): Promise<string | null> {
  // Evita consultar o banco a cada falha numa rajada (uma checagem a cada 15s).
  const now = Date.now();
  if (now - lastCheck < 15_000) return null;
  lastCheck = now;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin as any).rpc("trip_ai_maintenance_if_needed");
    if (error) {
      console.warn("[ai-maintenance] rpc falhou:", error.message);
      return null;
    }
    const baseReason = typeof data === "string" && data ? data : null;
    if (!baseReason) return null;

    const { detectAiProvider, AI_PROVIDER_BILLING_URL } = await import("@/lib/dify-error-messages");
    const provider = detectAiProvider(rawError) ?? "OpenAI";
    const where = AI_PROVIDER_BILLING_URL[provider];
    const reason = `${provider} sem crédito — ${baseReason.replace(/^IA sem crédito no provedor: /, "")}`;
    await (supabaseAdmin as any)
      .from("system_settings")
      .update({ maintenance_auto_reason: reason })
      .not("maintenance_auto_reason", "is", null);

    console.error("[ai-maintenance] MANUTENÇÃO LIGADA AUTOMATICAMENTE:", reason);
    const when = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
    const { sendAdminAlertEmail } = await import("@/lib/emails.server");
    const { sendAdminAlertWhatsApp } = await import("@/lib/admin-alerts-whatsapp.server");
    await Promise.all([
      sendAdminAlertEmail({
        subject: `⚠️ Lumma em manutenção automática — ${provider} sem crédito`,
        html: `<p><strong>A Lumma entrou em manutenção automaticamente em ${when}.</strong></p>
<p>Provedor: <strong>${provider}</strong> respondeu que a conta está sem crédito.<br/>${reason}.</p>
<p>Enquanto isso, nenhuma análise funciona — por isso as nutricionistas estão vendo a página de manutenção em vez de erros.</p>
<p><strong>Para voltar:</strong></p>
<ol>
<li>Recarregar o crédito em ${where} (vale ter recarga automática com folga).</li>
<li>Não precisa fazer mais nada: a cada 3 minutos a Lumma testa a IA e sai da manutenção sozinha quando ela responder. Você recebe outro aviso.</li>
<li>Se quiser liberar antes: Admin → Sistema → Manutenção (o Master Admin não é bloqueado).</li>
</ol>`,
      }).catch((e) => console.warn("[ai-maintenance] e-mail falhou:", e?.message)),
      sendAdminAlertWhatsApp(
        `⚠️ *Lumma em manutenção automática* (${when})\n\n` +
          `Provedor: *${provider}* sem crédito\n${reason.replace(`${provider} sem crédito — `, "")}\n\n` +
          `Recarregar em: ${where}\n` +
          `A Lumma volta sozinha quando a IA responder (teste a cada 3 min).`,
      ),
    ]);
    return reason;
  } catch (e: any) {
    console.warn("[ai-maintenance] falhou (ignorado):", e?.message);
    return null;
  }
}

/**
 * Teste periódico (pg_cron a cada 3 min → /api/public/ai-healthcheck).
 * Só age quando a manutenção foi ligada PELA TRAVA (maintenance_auto_reason).
 * Faz uma chamada mínima ao app "Lumma Healthcheck IA (NÃO APAGAR)" do Dify
 * (mesma conta OpenAI dos agentes; ~US$ 0,00001). Se responder, libera.
 */
export async function probeAndReleaseAiMaintenance(): Promise<{
  action: "skipped" | "still_down" | "released" | "error";
  detail?: string;
}> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const sb = supabaseAdmin as any;

    const { data: settings } = await sb
      .from("system_settings")
      .select("id, maintenance_enabled, maintenance_auto_reason, maintenance_auto_at")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!settings?.maintenance_enabled || !settings?.maintenance_auto_reason) {
      return { action: "skipped", detail: "manutenção automática não está ligada" };
    }

    const { data: rows } = await sb
      .from("integrations")
      .select("key, value")
      .in("key", ["dify_healthcheck_api_key", "dify_endpoint"]);
    const get = (k: string) => (rows ?? []).find((r: any) => r.key === k)?.value?.trim() ?? "";
    const apiKey = get("dify_healthcheck_api_key");
    const baseUrl = (get("dify_endpoint") || process.env.DIFY_BASE_URL || "").replace(/\/$/, "");
    if (!apiKey || !baseUrl) return { action: "error", detail: "chave do healthcheck ou endpoint ausente" };

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30_000);
    let ok = false;
    let detail = "";
    try {
      const res = await fetch(`${baseUrl}/chat-messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ inputs: {}, query: "ping", response_mode: "blocking", user: "lumma-healthcheck" }),
        signal: ctrl.signal,
      });
      const body: any = await res.json().catch(() => ({}));
      ok = res.ok && typeof body?.answer === "string";
      detail = ok ? "provedor respondeu" : `HTTP ${res.status}: ${String(body?.message ?? "").slice(0, 200)}`;
    } catch (e: any) {
      detail = `falha de rede: ${e?.message ?? e}`;
    } finally {
      clearTimeout(timer);
    }

    if (!ok) {
      console.warn("[ai-maintenance] teste: IA ainda fora —", detail);
      return { action: "still_down", detail };
    }

    const { data: upd } = await sb
      .from("system_settings")
      .update({
        maintenance_enabled: false,
        maintenance_auto_reason: null,
        maintenance_auto_at: null,
        maintenance_auto_released_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        updated_by: null,
      })
      .eq("id", settings.id)
      .not("maintenance_auto_reason", "is", null)
      .select("id");
    if (!upd?.length) return { action: "skipped", detail: "já liberada por outro caminho" };

    console.error("[ai-maintenance] IA voltou — manutenção desligada automaticamente");
    const { sendAdminAlertEmail } = await import("@/lib/emails.server");
    const { sendAdminAlertWhatsApp } = await import("@/lib/admin-alerts-whatsapp.server");
    const fmt = (d: Date) => d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
    await sendAdminAlertWhatsApp(
      `✅ *Lumma liberada* (${fmt(new Date())})\n\nA IA voltou a responder e a Lumma saiu da manutenção sozinha.` +
        (settings.maintenance_auto_at ? `\nFicou em manutenção desde ${fmt(new Date(settings.maintenance_auto_at))}.` : ""),
    );
    await sendAdminAlertEmail({
      subject: "✅ Lumma liberada — a IA voltou a responder",
      html: `<p><strong>A Lumma saiu da manutenção automaticamente em ${fmt(new Date())}.</strong></p>
<p>O teste periódico recebeu resposta do provedor de IA. Ficou em manutenção desde ${
        settings.maintenance_auto_at ? fmt(new Date(settings.maintenance_auto_at)) : "—"
      } (${settings.maintenance_auto_reason}).</p>
<p>Vale conferir no painel da OpenAI se a recarga automática está configurada com folga.</p>`,
    }).catch((e) => console.warn("[ai-maintenance] e-mail falhou:", e?.message));
    return { action: "released", detail };
  } catch (e: any) {
    console.warn("[ai-maintenance] teste falhou:", e?.message);
    return { action: "error", detail: e?.message };
  }
}
