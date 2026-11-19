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

/**
 * 4. Arquivo que o Dify não consegue abrir (nó "Extrator PDF" falha em
 *    menos de 1s, antes da IA). Reenviar o mesmo arquivo nunca resolve,
 *    então a mensagem diz o que fazer em vez de "tente novamente".
 *    Caso real (nov/2026): laudo de laboratório protegido por senha →
 *    "PDFium: Incorrect password error".
 */
export type FileProblem = "pdf_password" | "pdf_unreadable";

const PDF_PASSWORD_RX = /incorrect password|password (is )?required|password[- ]protected|encrypted (pdf|document|file)/i;
const PDF_UNREADABLE_RX = /failed to extract text from pdf|pdfium|failed to load document/i;

export function fileProblemFromError(raw: string | null | undefined): FileProblem | null {
  if (!raw) return null;
  if (PDF_PASSWORD_RX.test(raw)) return "pdf_password";
  if (PDF_UNREADABLE_RX.test(raw)) return "pdf_unreadable";
  return null;
}

export const PDF_PASSWORD_TEXT =
  "🔒 Este PDF está protegido por senha e a Lumma não consegue abri-lo.\n\n" +
  "Para resolver, gere uma cópia sem senha: abra o PDF (digitando a senha), clique em **Imprimir** (Ctrl+P), " +
  "escolha **Salvar como PDF** e envie o novo arquivo. Outra opção é enviar fotos ou prints das páginas do exame.\n\n" +
  "*Esta tentativa não foi cobrada.*";

export const PDF_UNREADABLE_TEXT =
  "⚠️ Não consegui abrir este PDF — o arquivo pode estar corrompido ou num formato que a Lumma não lê.\n\n" +
  "Baixe o exame de novo no site do laboratório e envie, ou envie fotos ou prints das páginas do exame.\n\n" +
  "*Esta tentativa não foi cobrada.*";

export const FILE_PROBLEM_TOAST: Record<FileProblem, { title: string; description: string }> = {
  pdf_password: {
    title: "PDF protegido por senha",
    description: "Gere uma cópia sem senha (Imprimir → Salvar como PDF) e envie de novo.",
  },
  pdf_unreadable: {
    title: "Não consegui abrir este PDF",
    description: "Baixe o exame de novo ou envie fotos/prints das páginas.",
  },
};

export function fileProblemText(p: FileProblem): string {
  return p === "pdf_password" ? PDF_PASSWORD_TEXT : PDF_UNREADABLE_TEXT;
}
