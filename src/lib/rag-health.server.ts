/**
 * Alerta da base de conhecimento (reranqueador Cohere).
 *
 * Caso real: de ~05/11 a 23/11/2026 a fatura da Cohere ficou em aberto, a conta
 * foi bloqueada e a busca com reranqueamento passou a voltar VAZIA, sem erro.
 * Plano Alimentar & Formulações, Composição Corporal, Composição por Foto e
 * Refeição seguiram respondendo sem os protocolos da base e ninguém soube.
 *
 * Teste (pg_cron a cada 30 min → /api/public/rag-healthcheck):
 *  1. busca na base de Formulações SEM reranqueamento (só vetor);
 *  2. mesma busca COM o reranqueador Cohere (como nos agentes).
 * Se (1) traz resultado e (2) volta vazio ou com erro → a Cohere está falhando.
 * Usa a API de Conhecimento do Dify (chave "dataset-…"), não mexe em nenhum app.
 * Custo: 1 reranqueamento por teste (~US$ 0,002) → ~US$ 3/mês.
 *
 * Avisos (mesmos e-mails e WhatsApp da trava de crédito da IA):
 *  - quando começa a falhar (após confirmar com um 2º teste);
 *  - lembrete a cada 12 h enquanto continuar falhando;
 *  - quando volta.
 * Não liga a manutenção: só 4 tarefas são afetadas; a decisão fica com a equipe.
 */

export const RAG_DEFAULT_RERANK_PROVIDER = "langgenius/cohere/cohere";
export const RAG_DEFAULT_RERANK_MODEL = "rerank-multilingual-v3.0";
export const RAG_DEFAULT_QUERY = "protocolo de suplementação anti-inflamatório para emagrecimento";
const REMINDER_MS = 12 * 60 * 60 * 1000;

export type RagProbe = {
  /** resultados sem reranqueamento (null = a própria busca falhou) */
  plain: number | null;
  /** resultados com o reranqueador (null = erro na chamada) */
  reranked: number | null;
  error?: string;
};

export type RagVerdict = "ok" | "rerank_failing" | "inconclusive";

/** Decisão pura (testada em rag-health.test.ts). */
export function ragVerdict(p: RagProbe): RagVerdict {
  if (p.plain === null || p.plain === 0) return "inconclusive"; // base/embedding fora: não é a Cohere
  if (p.reranked === null || p.reranked === 0) return "rerank_failing";
  return "ok";
}

/** Erro da Cohere que indica cobrança/forma de pagamento (para o texto do aviso). */
export function isRerankBillingError(raw: string | null | undefined): boolean {
  return /payment method|billing|invoice|trial key|limited to \d+ api calls|402|payment required/i.test(raw ?? "");
}

type Cfg = { baseUrl: string; apiKey: string; datasetId: string; provider: string; model: string; query: string };

async function difyJson(cfg: Cfg, path: string, init?: RequestInit): Promise<{ status: number; body: any }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 45_000);
  try {
    const res = await fetch(`${cfg.baseUrl}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
      signal: ctrl.signal,
    });
    const body = await res.json().catch(() => ({}));
    return { status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}

async function retrieve(cfg: Cfg, rerank: boolean): Promise<{ n: number | null; error?: string }> {
  const retrieval_model = rerank
    ? {
        search_method: "hybrid_search",
        reranking_enable: true,
        reranking_mode: "reranking_model",
        reranking_model: { reranking_provider_name: cfg.provider, reranking_model_name: cfg.model },
        top_k: 3,
        score_threshold_enabled: false,
      }
    : { search_method: "semantic_search", reranking_enable: false, top_k: 3, score_threshold_enabled: false };
  try {
    const { status, body } = await difyJson(cfg, `/datasets/${cfg.datasetId}/retrieve`, {
      method: "POST",
      body: JSON.stringify({ query: cfg.query, retrieval_model }),
    });
    if (status >= 400) return { n: null, error: `HTTP ${status}: ${String(body?.message ?? body?.code ?? "").slice(0, 300)}` };
    return { n: Array.isArray(body?.records) ? body.records.length : 0 };
  } catch (e: any) {
    return { n: null, error: `falha de rede: ${e?.message ?? e}` };
  }
}

async function loadConfig(sb: any): Promise<Cfg | { missing: string }> {
  const { data: rows } = await sb
    .from("integrations")
    .select("key, value")
    .in("key", [
      "dify_endpoint",
      "dify_dataset_api_key",
      "rag_healthcheck_dataset_id",
      "rag_healthcheck_rerank_model",
    ]);
  const get = (k: string) => (rows ?? []).find((r: any) => r.key === k)?.value?.trim() ?? "";
  const baseUrl = (get("dify_endpoint") || process.env.DIFY_BASE_URL || "").replace(/\/$/, "");
  const apiKey = get("dify_dataset_api_key");
  if (!baseUrl) return { missing: "endpoint do Dify" };
  if (!apiKey) return { missing: "chave da API de Conhecimento do Dify (dify_dataset_api_key)" };

  // "provedor|modelo" opcional; padrão = Cohere multilíngue v3 (o dos agentes).
  const [provider, model] = (get("rag_healthcheck_rerank_model") || "").split("|").map((s: string) => s.trim());
  const cfg: Cfg = {
    baseUrl,
    apiKey,
    datasetId: get("rag_healthcheck_dataset_id"),
    provider: provider || RAG_DEFAULT_RERANK_PROVIDER,
    model: model || RAG_DEFAULT_RERANK_MODEL,
    query: RAG_DEFAULT_QUERY,
  };
  if (!cfg.datasetId) {
    // Sem id configurado: usa a base de Formulações (KB3), achada pelo nome.
    const { status, body } = await difyJson(cfg, `/datasets?page=1&limit=100`);
    if (status >= 400) return { missing: `lista de bases (HTTP ${status})` };
    const ds = (body?.data ?? []).find((d: any) => /formula/i.test(String(d?.name ?? "")));
    if (!ds?.id) return { missing: "base de Formulações não encontrada" };
    cfg.datasetId = ds.id;
  }
  return cfg;
}

async function probeOnce(cfg: Cfg): Promise<RagProbe> {
  const plain = await retrieve(cfg, false);
  const rr = await retrieve(cfg, true);
  return { plain: plain.n, reranked: rr.n, error: rr.error ?? plain.error };
}

export async function checkRagHealth(): Promise<{
  action: "ok" | "failing" | "alerted" | "reminded" | "recovered" | "inconclusive" | "not_configured" | "error";
  detail?: string;
}> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const sb = supabaseAdmin as any;
    const { data: st } = await sb
      .from("system_settings")
      .select("id, rag_health_status, rag_health_failed_since, rag_health_last_alert_at")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!st) return { action: "error", detail: "system_settings vazio" };

    const cfg = await loadConfig(sb);
    if ("missing" in cfg) return { action: "not_configured", detail: `falta ${cfg.missing}` };

    let probe = await probeOnce(cfg);
    let verdict = ragVerdict(probe);
    if (verdict === "rerank_failing" && st.rag_health_status !== "failing") {
      // Confirma antes do 1º aviso (evita alarme por uma oscilação de rede).
      await new Promise((r) => setTimeout(r, 15_000));
      probe = await probeOnce(cfg);
      verdict = ragVerdict(probe);
    }
    const now = new Date();
    const detail = `sem reranqueamento: ${probe.plain ?? "erro"} | com ${cfg.model}: ${probe.reranked ?? "erro"}${
      probe.error ? ` | ${probe.error}` : ""
    }`;
    const save = (patch: Record<string, unknown>) =>
      sb.from("system_settings").update({ rag_health_checked_at: now.toISOString(), rag_health_detail: detail.slice(0, 500), ...patch }).eq("id", st.id);

    if (verdict === "inconclusive") {
      await save({});
      return { action: "inconclusive", detail };
    }

    const { sendAdminAlertEmail } = await import("@/lib/emails.server");
    const { sendAdminAlertWhatsApp } = await import("@/lib/admin-alerts-whatsapp.server");
    const fmt = (d: Date) => d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
    const billing = isRerankBillingError(probe.error);
    const whatToDo = billing
      ? "A Cohere recusou por cobrança/forma de pagamento: conferir fatura em aberto e o cartão em https://dashboard.cohere.com/billing"
      : "Conferir a conta da Cohere (fatura, cartão, chave) em https://dashboard.cohere.com/billing e a chave em Dify → Configurações → Provedores de modelo → Cohere";

    if (verdict === "ok") {
      if (st.rag_health_status === "failing") {
        await save({ rag_health_status: "ok", rag_health_failed_since: null, rag_health_last_alert_at: now.toISOString() });
        const since = st.rag_health_failed_since ? fmt(new Date(st.rag_health_failed_since)) : "—";
        await sendAdminAlertWhatsApp(
          `✅ *Base de conhecimento da Lumma voltou* (${fmt(now)})\n\nO reranqueador (Cohere) voltou a responder. Estava falhando desde ${since}.`,
        );
        await sendAdminAlertEmail({
          subject: "✅ Lumma: base de conhecimento voltou (Cohere)",
          html: `<p><strong>O reranqueador da base de conhecimento (Cohere) voltou a responder em ${fmt(now)}.</strong></p>
<p>Estava falhando desde ${since}. As tarefas de Plano Alimentar & Formulações, Composição Corporal, Composição por Foto e Refeição voltaram a consultar a base.</p>`,
        }).catch((e) => console.warn("[rag-health] e-mail falhou:", e?.message));
        return { action: "recovered", detail };
      }
      await save({ rag_health_status: "ok" });
      return { action: "ok", detail };
    }

    // rerank_failing
    const firstTime = st.rag_health_status !== "failing";
    const lastAlert = st.rag_health_last_alert_at ? new Date(st.rag_health_last_alert_at).getTime() : 0;
    const due = firstTime || now.getTime() - lastAlert >= REMINDER_MS;
    const failedSince = firstTime ? now : new Date(st.rag_health_failed_since ?? now);
    if (!due) {
      await save({ rag_health_status: "failing" });
      return { action: "failing", detail };
    }
    await save({
      rag_health_status: "failing",
      rag_health_failed_since: failedSince.toISOString(),
      rag_health_last_alert_at: now.toISOString(),
    });
    console.error("[rag-health] reranqueador falhando:", detail);
    const head = firstTime ? "⚠️ *Lumma: base de conhecimento falhando*" : "⚠️ *Lembrete: base de conhecimento da Lumma ainda falhando*";
    await sendAdminAlertWhatsApp(
      `${head} (${fmt(now)})\n\n` +
        `O reranqueador (Cohere) não está respondendo${firstTime ? "" : ` desde ${fmt(failedSince)}`}. ` +
        `A Lumma continua funcionando, mas Plano Alimentar & Formulações, Composição Corporal, Composição por Foto e Refeição ` +
        `respondem SEM os protocolos da base.\n\n${whatToDo}\n\n` +
        `Você recebe outro aviso quando voltar.`,
    );
    await sendAdminAlertEmail({
      subject: firstTime
        ? "⚠️ Lumma: base de conhecimento falhando (Cohere)"
        : "⚠️ Lembrete: base de conhecimento da Lumma ainda falhando (Cohere)",
      html: `<p><strong>O reranqueador da base de conhecimento (Cohere) não está respondendo${
        firstTime ? "" : ` desde ${fmt(failedSince)}`
      }.</strong></p>
<p>A Lumma continua no ar, mas as tarefas <strong>Plano Alimentar & Formulações, Composição Corporal, Composição por Foto e Refeição</strong> respondem sem consultar os protocolos da base — a resposta sai pior e sem aviso para a nutricionista.</p>
<p><strong>O que fazer:</strong> ${whatToDo}.</p>
<p>Teste feito: ${detail}.</p>
<p>O teste roda a cada 30 minutos; você recebe outro aviso quando voltar (e um lembrete a cada 12 h enquanto continuar falhando).</p>`,
    }).catch((e) => console.warn("[rag-health] e-mail falhou:", e?.message));
    return { action: firstTime ? "alerted" : "reminded", detail };
  } catch (e: any) {
    console.warn("[rag-health] teste falhou:", e?.message);
    return { action: "error", detail: e?.message };
  }
}
