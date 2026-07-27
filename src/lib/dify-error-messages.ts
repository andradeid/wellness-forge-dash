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
