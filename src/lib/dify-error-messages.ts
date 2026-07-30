/**
 * Mensagens amigáveis para erros conhecidos do Dify / provedor LLM.
 * Escopo: só UX no caminho de falha — não altera fluxo feliz.
 */

export const CONCURRENCY_USER_MESSAGE =
  "⚠️ Neste momento há muita demanda no sistema (pico de uso). Aguarde alguns instantes e tente novamente — se anexou um exame, reenvie o arquivo.";

export const CONCURRENCY_TOAST_TITLE = "Sistema em pico de uso";

export const CONCURRENCY_TOAST_DESCRIPTION =
  "Volte em alguns instantes e envie novamente. Isso costuma passar rápido.";

/** Detecta 503 / concurrent / overload do provedor LLM (ex.: Gemini). */
export function isProviderConcurrencyError(raw: string | undefined | null): boolean {
  const msg = (raw ?? "").toLowerCase();
  if (!msg) return false;
  return (
    /too many concurrent requests/.test(msg) ||
    /concurrent requests/.test(msg) ||
    /model is overloaded/.test(msg) ||
    /high demand/.test(msg) ||
    (/503/.test(msg) &&
      /unavailable|concurrent|overloaded|high demand|server unavailable/.test(msg)) ||
    /server unavailable error/.test(msg)
  );
}

/** Extrai texto útil de um evento SSE `error` do Dify. */
export function extractDifyStreamErrorMessage(data: Record<string, unknown>): string {
  const parts = [data.message, data.code, data.status, data.error]
    .filter((v) => v != null && String(v).trim())
    .map((v) => String(v));
  return parts.join(" ");
}

/* ------------------------------------------------------------------ *
 * Classificação de erros estruturados devolvidos DENTRO da resposta
 * do agente (o Dify às vezes entrega o erro como texto/JSON no answer,
 * e não como evento SSE `error`).
 * ------------------------------------------------------------------ */

/** Erro real de conteúdo: o que foi enviado não é um laudo laboratorial. */
export const NOT_A_LAB_REPORT_MESSAGE =
  "Conteúdo não reconhecido como laudo laboratorial. Por favor, envie um exame.";

/** Falha técnica/temporária do provedor — NÃO é problema do arquivo enviado. */
export const TECHNICAL_TEMPORARY_MESSAGE =
  "O serviço está com alta demanda no momento. Aguarde alguns instantes e tente novamente. Não é problema com o seu exame.";

export type AgentErrorKind = "content" | "technical";

export interface AgentErrorInfo {
  kind: AgentErrorKind;
  /** Mensagem amigável (nunca o JSON cru). */
  message: string;
  /** Payload original, só para log/diagnóstico. Nunca renderizar. */
  raw: string;
}

/**
 * Detecta falha técnica/temporária (503, timeout, indisponibilidade,
 * sobrecarga, erro de plugin/rede). Superset de `isProviderConcurrencyError`.
 */
export function isTechnicalAgentError(raw: string | undefined | null): boolean {
  const msg = (raw ?? "").toLowerCase();
  if (!msg) return false;
  if (isProviderConcurrencyError(msg)) return true;
  return (
    /plugininvokeerror|plugin_invoke|servererror|server_error|internalerror/.test(msg) ||
    /\bunavailable\b|service unavailable|temporarily unavailable/.test(msg) ||
    /\b(429|500|502|503|504)\b/.test(msg) ||
    /timeout|timed out|deadline exceeded|deadline_exceeded/.test(msg) ||
    /rate limit|resource[_ ]exhausted|quota/.test(msg) ||
    /overload|try again later|please try again/.test(msg) ||
    /network|econnreset|fetch failed|connection (reset|refused|closed)/.test(msg) ||
    /model (is )?(unavailable|not available|error)|upstream/.test(msg) ||
    /bad gateway|gateway timeout/.test(msg)
  );
}

/** Encontra o `}` que fecha o `{` em startIdx, respeitando strings. */
function matchingBrace(text: string, startIdx: number): number {
  if (text[startIdx] !== "{") return -1;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = startIdx; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) { escaped = false; continue; }
      if (ch === "\\") { escaped = true; continue; }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Coleta candidatos de JSON de erro no texto (blocos ```json``` e JSON solto). */
function collectErrorPayloads(text: string): string[] {
  const out: string[] = [];
  const blockRe = /```(?:json)?\s*([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(text))) {
    const raw = m[1].trim();
    if (raw.startsWith("{") && raw.includes('"error')) out.push(raw);
  }
  const marker = /"error(?:_type|_code|_message)?"\s*:/g;
  let mk: RegExpExecArray | null;
  while ((mk = marker.exec(text))) {
    const start = text.lastIndexOf("{", mk.index);
    if (start === -1) continue;
    const end = matchingBrace(text, start);
    if (end === -1) continue;
    out.push(text.slice(start, end + 1));
  }
  return out;
}

/**
 * Classifica um erro estruturado presente no texto do agente.
 *
 * Regra crítica: `content` (não é laudo) SÓ é retornado quando o payload traz
 * literalmente `error_type: "not_a_lab_report"` E não há nenhum sinal técnico
 * junto. Qualquer outro erro — inclusive desconhecido — é tratado como
 * `technical`, para nunca acusar indevidamente o exame do usuário.
 */
export function classifyAgentError(text: string | undefined | null): AgentErrorInfo | null {
  const src = text ?? "";
  if (!src) return null;

  const hasErrorHint = /"error/i.test(src) || /plugininvokeerror/i.test(src);
  if (!hasErrorHint) return null;

  for (const candidate of collectErrorPayloads(src)) {
    let parsed: any;
    try {
      parsed = JSON.parse(candidate);
    } catch {
      continue;
    }
    if (!parsed || typeof parsed !== "object") continue;

    const errorType = String(parsed.error_type ?? parsed.errorType ?? "");
    const inner =
      typeof parsed.error === "object" && parsed.error !== null ? parsed.error : null;
    const innerCode = inner ? String((inner as any).code ?? "") : "";
    const innerStatus = inner ? String((inner as any).status ?? "") : "";
    const message = String(parsed.message ?? (inner ? (inner as any).message : "") ?? "");

    const isErrorPayload =
      parsed.error === true ||
      !!inner ||
      !!errorType ||
      typeof parsed.error === "string";
    if (!isErrorPayload) continue;

    const signal = [errorType, message, innerCode, innerStatus, candidate].join(" ");
    if (isTechnicalAgentError(signal)) {
      return { kind: "technical", message: TECHNICAL_TEMPORARY_MESSAGE, raw: candidate.slice(0, 500) };
    }
    if (errorType === "not_a_lab_report") {
      return { kind: "content", message: NOT_A_LAB_REPORT_MESSAGE, raw: candidate.slice(0, 500) };
    }
    // Erro estruturado desconhecido: nunca culpar o exame.
    return { kind: "technical", message: TECHNICAL_TEMPORARY_MESSAGE, raw: candidate.slice(0, 500) };
  }

  // Erro técnico em texto puro (sem JSON parseável), ex.: PluginInvokeError.
  if (/plugininvokeerror/i.test(src) && isTechnicalAgentError(src)) {
    return { kind: "technical", message: TECHNICAL_TEMPORARY_MESSAGE, raw: src.slice(0, 500) };
  }

  return null;
}

/**
 * Texto seguro para exibir DURANTE o stream: impede que o JSON cru de erro
 * apareça na bolha enquanto a resposta ainda está chegando.
 */
export function sanitizeStreamingText(text: string): string {
  if (!text) return text;
  if (!/"error/i.test(text) && !/plugininvokeerror/i.test(text)) return text;

  const classified = classifyAgentError(text);
  if (classified) return classified.message;

  // Payload de erro ainda incompleto (JSON não fechou): não mostra nada.
  const trimmed = text.trimStart();
  if (trimmed.startsWith("{") || trimmed.startsWith("```")) return "";
  return text;
}

