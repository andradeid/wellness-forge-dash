/**
 * Proteção do acesso comprado fora da Stripe (Kiwify, TMB, Hubla, manual).
 *
 * A tabela `subscriptions` tem uma linha por cliente. Quem tinha assinatura
 * mensal na Stripe e comprou um plano de 2 anos na Kiwify ficava com a linha
 * da Kiwify (validade 2028), mas o aviso seguinte da Stripe (cancelamento
 * pedido ou fim do período) sobrescrevia status e validade com os da Stripe,
 * e a cliente perdia o acesso no fim do mês (caso real: 21/11/2026).
 *
 * Regra: um aviso da Stripe não encurta nem cancela uma validade local que
 * vai além do período da Stripe quando existe compra paga fora da Stripe
 * depois do início dessa assinatura. Nesse caso só os ids da Stripe são
 * atualizados.
 */
export interface ExternalPlanGuardInput {
  localStatus: string | null;
  localPeriodEnd: string | null;
  /** Fim do período informado pela Stripe (ISO) ou null. */
  stripePeriodEnd: string | null;
  /** Início da assinatura na Stripe (ISO) ou null. */
  stripeStartedAt: string | null;
  /** Data da última compra paga fora da Stripe (ISO) ou null. */
  externalPaidAt: string | null;
  now?: Date;
}

export function shouldKeepExternalPlan(i: ExternalPlanGuardInput): boolean {
  if (!i.externalPaidAt || !i.localPeriodEnd) return false;
  if (i.localStatus !== "active" && i.localStatus !== "trial") return false;
  const now = i.now ?? new Date();
  const localEnd = new Date(i.localPeriodEnd);
  if (!(localEnd > now)) return false;
  if (i.stripeStartedAt && new Date(i.externalPaidAt) < new Date(i.stripeStartedAt)) return false;
  if (i.stripePeriodEnd && !(localEnd > new Date(i.stripePeriodEnd))) return false;
  return true;
}

/** Pagamento registrado por integração que não é a Stripe (id do evento não começa com evt_). */
export function isExternalPaymentEventId(eventId: string | null | undefined): boolean {
  if (!eventId) return false;
  return !eventId.startsWith("evt_");
}
