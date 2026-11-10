/**
 * Campanha "A Nova Nutricionista – Black Friday" exibida ao entrar na Lumma.
 *
 * Regras:
 * - só para nutricionistas, só durante a campanha (CAMPAIGN_END, inclusive);
 * - abre em todo acesso, como o aviso de treinamento, até a nutricionista marcar
 *   "Não mostrar novamente";
 * - não aparece para quem já comprou o produto (TMB ou Kiwify) nem para quem já tem
 *   acesso longo (validade a mais de 13 meses — caso das compras liberadas à mão).
 * Para encerrar antes, mude CAMPAIGN_END para uma data passada.
 */
export const BLACK_FRIDAY_URL =
  "https://lp.institutoapp.com.br/nova-nutricionista?utm_source=LUMMA&utm_medium=LUMMA&utm_campaign=LUMMA&utm_content=LUMMA";
export const BLACK_FRIDAY_IMAGE = "/black-friday/nova-nutricionista.jpg";
/** Último dia da campanha (horário de Brasília). */
export const CAMPAIGN_END = "2026-11-30";
export const SEEN_KEY = "lumma-black-friday-2026-never";

/** Produto da Kiwify "A Nova Nutricionista – Black Friday". */
const KIWIFY_BLACK_PRODUCT = "c1df6360-d3b5-11f1-aaf7-2ffa08014d49";

export function campaignActive(now: Date = new Date()): boolean {
  // Fim do dia em Brasília (UTC−3).
  const end = new Date(`${CAMPAIGN_END}T23:59:59-03:00`);
  return now.getTime() <= end.getTime();
}

function store(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** Igual ao aviso de treinamento: abre em todo acesso até marcar "Não mostrar novamente". */
export function neverShow(): boolean {
  try {
    return store()?.getItem(SEEN_KEY) === "never";
  } catch {
    return false;
  }
}

export function setNeverShow(never: boolean): void {
  try {
    if (never) store()?.setItem(SEEN_KEY, "never");
    else store()?.removeItem(SEEN_KEY);
  } catch {
    /* sem storage: a preferência não persiste */
  }
}

/** Já comprou a Black? Olha o histórico de pagamentos da própria conta. */
export function boughtBlackFriday(
  payments: Array<{ metadata?: Record<string, unknown> | null; status?: string | null }>,
): boolean {
  return payments.some((p) => {
    if (p.status && p.status !== "paid") return false;
    const m = p.metadata ?? {};
    return m.tmb_produto === "nova-nutricionista" || m.kiwify_product_id === KIWIFY_BLACK_PRODUCT;
  });
}

/**
 * Acesso de cerca de 2 anos (validade entre 13 meses e o ano 2099) = já tem a Black,
 * inclusive quem foi liberado à mão. Contas vitalícias/ilimitadas (2100+) continuam vendo.
 */
export function hasLongAccess(currentPeriodEnd: string | null | undefined, now: Date = new Date()): boolean {
  if (!currentPeriodEnd) return false;
  const end = new Date(currentPeriodEnd);
  if (isNaN(end.getTime())) return false;
  const limit = new Date(now);
  limit.setMonth(limit.getMonth() + 13);
  return end.getTime() > limit.getTime() && end.getUTCFullYear() < 2100;
}
