/**
 * Carência da renovação Hubla (boleto/Pix/cartão pendente).
 *
 * Problema: na data da renovação a Hubla gera a fatura nova ("unpaid") com
 * vencimento alguns dias depois, mas o período da Lumma termina no próprio dia
 * da renovação — a aluna perde o acesso antes de o boleto vencer.
 *
 * Regra: quando chega `invoice.status_updated` com status "unpaid" de uma
 * assinatura recorrente, o acesso vai até o fim do dia do vencimento
 * (horário de Brasília), limitado a MAX_GRACE_DAYS a partir de agora.
 * Só vale para quem acabou de chegar ao fim do período (até LOOKBACK_DAYS
 * atrás) — não reativa assinatura parada há tempo. Nunca encurta o período.
 */

export const MAX_GRACE_DAYS = 10;
export const LOOKBACK_DAYS = 7;
const DAY = 24 * 3600 * 1000;

export interface HublaGraceInput {
  invoiceStatus: string | null | undefined;
  dueDate: string | null | undefined;
  hasSubscription: boolean;
  subStatus: string | null | undefined;
  currentPeriodEnd: string | null | undefined;
  now?: Date;
}

/** Fim do dia (23:59:59 em Brasília, UTC-3) da data de vencimento. */
export function endOfDayBrasilia(iso: string): Date {
  const d = new Date(iso);
  // data do vencimento no fuso de Brasília
  const br = new Date(d.getTime() - 3 * 3600 * 1000);
  const y = br.getUTCFullYear(),
    m = br.getUTCMonth(),
    day = br.getUTCDate();
  // 23:59:59 BRT = 02:59:59 UTC do dia seguinte
  return new Date(Date.UTC(y, m, day + 1, 2, 59, 59));
}

/** Retorna o novo fim do período (ISO) ou null quando não deve mexer. */
export function computeHublaGraceEnd(input: HublaGraceInput): string | null {
  const now = input.now ?? new Date();
  if (String(input.invoiceStatus ?? "").toLowerCase() !== "unpaid") return null;
  if (!input.hasSubscription) return null;
  if (!input.dueDate || isNaN(new Date(input.dueDate).getTime())) return null;
  if (input.subStatus && !["active", "past_due"].includes(String(input.subStatus))) return null;

  const current = input.currentPeriodEnd ? new Date(input.currentPeriodEnd).getTime() : NaN;
  if (isNaN(current)) return null;
  if (current < now.getTime() - LOOKBACK_DAYS * DAY) return null;

  const due = endOfDayBrasilia(input.dueDate).getTime();
  if (due <= now.getTime()) return null;
  const capped = Math.min(due, now.getTime() + MAX_GRACE_DAYS * DAY);
  if (capped <= current) return null;
  return new Date(capped).toISOString();
}
