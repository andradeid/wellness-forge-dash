/**
 * Decide qual aviso mostrar no topo da conversa do paciente.
 *
 * - "longa": a conversa passou de LONG_CHAT_THRESHOLD mensagens. Nos dados de
 *   nov/2026, conversas com 80+ mensagens falharam cerca de 2x mais que as
 *   curtas (0,35 erro por conversa contra 0,17 nas de menos de 20).
 * - "inativa": a última mensagem tem mais de `thresholdHours` horas.
 * Quando as duas valem, o aviso de conversa longa tem prioridade.
 */

export const LONG_CHAT_THRESHOLD = 60;

export type ChatBannerKind = "longa" | "inativa" | null;

export function chatBannerKind(opts: {
  messageCount: number;
  lastAt: Date | null;
  now?: Date;
  thresholdHours?: number;
}): ChatBannerKind {
  if (opts.messageCount >= LONG_CHAT_THRESHOLD) return "longa";
  if (!opts.lastAt) return null;
  const now = opts.now ?? new Date();
  const diffH = (now.getTime() - opts.lastAt.getTime()) / 36e5;
  return diffH >= (opts.thresholdHours ?? 24) ? "inativa" : null;
}
