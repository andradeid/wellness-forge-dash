/**
 * Regras de proteção do stream do Dify usadas pelo chat (useDifyChat).
 *
 * 1. Mensagem genérica de falha: só pede para reenviar o arquivo quando
 *    a mensagem tinha anexo.
 * 2. Conversa "perdida" no Dify ("Workflow run ID not found" e afins):
 *    a conversa longa não pode mais ser retomada; a correção é abrir uma
 *    conversa nova e reenviar a mesma pergunta uma vez.
 * 3. Resposta cortada pelo limite de saída do modelo (finish_reason
 *    "length"/"MAX_TOKENS"): o Dify encerra como sucesso, mas o texto está
 *    incompleto. A tela marca como parcial e não cobra crédito.
 */

export const GENERIC_FAIL_WITH_FILE =
  "⚠️ Não consegui processar sua solicitação desta vez. Tente enviar novamente — se anexou um exame, reenvie o arquivo.";

export const GENERIC_FAIL_NO_FILE =
  "⚠️ Não consegui processar sua solicitação desta vez. Tente enviar novamente.";

export function genericFailText(hasAttachment: boolean): string {
  return hasAttachment ? GENERIC_FAIL_WITH_FILE : GENERIC_FAIL_NO_FILE;
}

const STALE_CONVERSATION_RX =
  /workflow run id not found|conversation not exists|conversation not found|conversation does not exist/i;

/** Erro do Dify que indica conversa que não pode mais ser retomada. */
export function isStaleConversationError(raw: string | null | undefined): boolean {
  return !!raw && STALE_CONVERSATION_RX.test(raw);
}

/** finish_reason de nó LLM que indica corte pelo limite de saída. */
export function isTruncatedFinish(reason: unknown): boolean {
  if (typeof reason !== "string") return false;
  const r = reason.trim().toLowerCase();
  return r === "length" || r === "max_tokens";
}

export const TRUNCATED_NOTE =
  "\n\n⚠️ *A resposta foi interrompida antes do fim e não foi cobrada. Envie novamente para gerar a análise completa.*";
