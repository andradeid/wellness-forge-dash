/**
 * Registro de falhas (e respostas suspeitas) das chamadas ao Dify.
 *
 * Objetivo: preservar o erro BRUTO devolvido pelo Dify, junto com contexto
 * suficiente para investigação (usuária, conversa, perfil, tarefa, duração,
 * anexo). A mensagem amigável mostrada à usuária continua inalterada.
 *
 * Regra: gravar aqui NUNCA pode quebrar o fluxo do chat — toda falha de
 * escrita é engolida e apenas logada no console.
 */

const MAX_RAW_BYTES = 20_000;

export type DifyErrorKind =
  | "timeout"
  | "connection"
  | "upstream_error"
  | "rate_limit"
  | "high_demand"
  | "file_read"
  | "task_routing"
  | "content_error"
  | "empty_answer"
  | "suspicious_fast"
  | "no_execution"
  | "missing_markers"
  | "unknown";


export interface DifyErrorLogInput {
  userId?: string | null;
  chatId?: string | null;
  conversationId?: string | null;
  patientId?: string | null;
  patientProfile?: string | null;
  selectedTask?: string | null;
  agentType?: string | null;
  errorKind?: DifyErrorKind;
  httpStatus?: number | null;
  rawError?: string | null;
  durationMs?: number | null;
  attachmentCount?: number | null;
  attachmentName?: string | null;
  attachmentMime?: string | null;
  wasRetry?: boolean;
  billed?: boolean;
  source?: "server" | "client";
  metadata?: Record<string, unknown>;
}

/** Só aceita UUID; qualquer outro formato vira null (colunas são uuid). */
function asUuid(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s) ? s : null;
}

function trim(v: unknown, max = 300): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s.slice(0, max) : null;
}

/**
 * Classifica o erro bruto em uma família reconhecível na tela do admin.
 * A classificação é indicativa — o erro bruto continua íntegro no registro.
 */
export function classifyRawDifyError(
  raw: string | null | undefined,
  httpStatus?: number | null,
): DifyErrorKind {
  const msg = (raw ?? "").toLowerCase();
  if (httpStatus === 429) return "rate_limit";
  if (/timeout|timed out|deadline exceeded|abort/.test(msg) || httpStatus === 504) return "timeout";
  if (/fetch failed|econnreset|connection (reset|refused|closed)|network/.test(msg)) return "connection";
  if (/signed ?url|failed to (download|fetch) (the )?file|file not found|unsupported file|download.*file/.test(msg))
    return "file_read";
  if (/concurrent|overload|high demand|too many requests|resource[_ ]exhausted|quota/.test(msg))
    return "high_demand";
  if (/selected_task|not.*routed|unknown task/.test(msg)) return "task_routing";
  if (httpStatus && httpStatus >= 400) return "upstream_error";
  return msg ? "unknown" : "unknown";
}

/** Abaixo disso não houve execução no Dify — a chamada falhou antes de despachar. */
export const NO_EXECUTION_MS = 5_000;

/**
 * Limiar de duração abaixo do qual uma resposta "de sucesso" é suspeita.
 * Só faz sentido em mensagem COM ANEXO: turno de conversa (pergunta de
 * acompanhamento, recusa, follow-up) viaja com o mesmo `selected_task` e
 * responde rápido por natureza. Retorna null quando duração não é critério.
 */
export function fastResponseThresholdMs(
  selectedTask: string | null | undefined,
  hasFile: boolean,
): number | null {
  if (!hasFile) return null;
  const task = (selectedTask ?? "").toLowerCase();
  if (task.startsWith("exam")) return 30_000;
  if (task === "bioimpedancia") return 15_000;
  if (task === "calorimetria" || task === "genetica" || task === "microbioma") return 15_000;
  if (task === "estimativa_refeicao_foto" || task === "composicao_corporal_foto") return 15_000;
  // Formulações (production) e raciocínio (reasoning): duração não serve.
  return null;
}

/** Tarefas em que a resposta com anexo deve trazer o array de marcadores. */
export function expectsMarkers(selectedTask: string | null | undefined): boolean {
  const task = (selectedTask ?? "").toLowerCase();
  return (
    task.startsWith("exam") ||
    task === "bioimpedancia" ||
    task === "calorimetria" ||
    task === "genetica" ||
    task === "microbioma" ||
    task === "composicao_corporal_foto"
  );
}


/** Grava o registro. Nunca lança. */
export async function recordDifyErrorLog(input: DifyErrorLogInput): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const raw = typeof input.rawError === "string" ? input.rawError.slice(0, MAX_RAW_BYTES) : null;
    const count = Math.max(0, Number(input.attachmentCount ?? 0) || 0);

    const { error } = await (supabaseAdmin as any).from("dify_error_logs").insert({
      user_id: asUuid(input.userId),
      chat_id: asUuid(input.chatId),
      conversation_id: trim(input.conversationId, 120),
      patient_id: asUuid(input.patientId),
      patient_profile: trim(input.patientProfile, 60),
      selected_task: trim(input.selectedTask, 60),
      agent_type: trim(input.agentType, 60),
      error_kind: input.errorKind ?? classifyRawDifyError(raw, input.httpStatus),
      http_status: typeof input.httpStatus === "number" ? input.httpStatus : null,
      raw_error: raw,
      duration_ms:
        typeof input.durationMs === "number" && Number.isFinite(input.durationMs)
          ? Math.round(input.durationMs)
          : null,
      had_attachment: count > 0,
      attachment_count: count,
      attachment_name: trim(input.attachmentName, 300),
      attachment_mime: trim(input.attachmentMime, 120),
      was_retry: Boolean(input.wasRetry),
      billed: Boolean(input.billed),
      source: input.source ?? "server",
      metadata: input.metadata ?? {},
    });
    if (error) console.warn("[dify-error-log] insert falhou:", error.message);
  } catch (e) {
    console.warn("[dify-error-log] gravação falhou (ignorado):", e);
  }
}
