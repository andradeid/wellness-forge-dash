/**
 * Catálogo de produtos da Kiwify aceitos pela Lumma.
 *
 * Cada linha define qual plano a compra libera e por quantos anos a conta
 * fica ativa a partir da data da compra. Os créditos seguem sendo repostos
 * todo mês, independentemente do número de anos.
 *
 * Para mudar a validade de um produto, basta ajustar `years` nesta linha.
 */

export type KiwifyPlanSlug = "starter" | "pro";

export interface KiwifyProduct {
  /** Plano que a compra libera. */
  slug: KiwifyPlanSlug;
  /** Ciclo de cobrança tratado pelo sistema. */
  cycle: "yearly";
  /** Anos de validade concedidos na compra. */
  years: number;
}

export const KIWIFY_PRODUCTS: Record<string, KiwifyProduct> = {
  // Starter Anual
  "a19b7600-851a-11f1-ac2c-dbf6162aa415": { slug: "starter", cycle: "yearly", years: 1 },
  // Pro Anual
  "59a89e30-851b-11f1-be44-db22545a0013": { slug: "pro", cycle: "yearly", years: 1 },
  // Upgrade - Lumma 2.0 - Pro Anual (quem já é Starter e migra para Pro)
  "53f6ae60-89d9-11f1-be8a-11fc729f7dc2": { slug: "pro", cycle: "yearly", years: 1 },
  // A Nova Nutricionista – Black Friday – WAID (Starter, validade de 2 anos)
  "c1df6360-d3b5-11f1-aaf7-2ffa08014d49": { slug: "starter", cycle: "yearly", years: 2 },
};

/** Rótulo de validade em português para o histórico de pagamentos. */
export function kiwifyValidityLabel(years: number): string {
  return years === 1 ? "Anual" : `${years} anos`;
}
