/**
 * Integração com a TMB (Tem Mais no Boleto) — Webhook de Vendas.
 *
 * A TMB não manda o id do produto no payload: o webhook é configurado no
 * próprio produto (PRODUTOS → Mais opções → Integrações → Webhook Vendas).
 * Por isso a URL cadastrada lá leva o produto: /api/public/tmb-webhook?produto=<chave>.
 * Se a chave faltar, o produto é reconhecido pelo nome do lançamento/título.
 *
 * Eventos (campo "status_pedido"):
 *   - Efetivado: cliente pagou o boleto de entrada → libera o acesso.
 *   - Cancelado: pedido cancelado depois da entrada → cancela o acesso.
 * Documentação: info.tmbeducacao.com.br/portal-do-produtor/central-de-ajuda/produto/integracoes/vendas
 */

export type TmbPlanSlug = "starter" | "pro";

export interface TmbProduct {
  /** Nome do produto, como aparece no histórico de pagamentos. */
  label: string;
  /** Plano que a compra libera. */
  slug: TmbPlanSlug;
  cycle: "yearly";
  /** Anos de validade a partir da data em que o pedido foi efetivado. */
  years: number;
  /** Reconhece o produto pelo nome do lançamento/título quando a URL não traz a chave. */
  match: RegExp;
}

export const TMB_PRODUCTS: Record<string, TmbProduct> = {
  // A Nova Nutricionista – Black Friday: Starter com 2 anos (mesma regra da Kiwify).
  "nova-nutricionista": {
    label: "A Nova Nutricionista",
    slug: "starter",
    cycle: "yearly",
    years: 2,
    match: /nova\s+nutricionista/i,
  },
};

export type TmbStatus = "efetivado" | "cancelado" | "outro";

export interface TmbOrder {
  /** Número do pedido na TMB. */
  pedido: string;
  status: TmbStatus;
  statusRaw: string;
  email: string | null;
  nome: string | null;
  telefone: string | null;
  /** Valor do produto (sem juros do parcelamento), em centavos. */
  valorCents: number;
  parcelas: number | null;
  /** Data em que o pedido foi efetivado (ou criado), ISO. */
  dataEfetivado: string | null;
  lancamento: string | null;
  titulo: string | null;
}

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function normalize(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

export function tmbStatus(raw: unknown): TmbStatus {
  const s = normalize(String(raw ?? ""));
  if (s === "efetivado") return "efetivado";
  if (s === "cancelado") return "cancelado";
  return "outro";
}

/** Converte valor em reais (número ou texto "1.234,56" / "1234.56") para centavos. */
export function reaisToCents(raw: unknown): number {
  if (raw === null || raw === undefined || raw === "") return 0;
  if (typeof raw === "number") return isFinite(raw) ? Math.round(raw * 100) : 0;
  let s = String(raw).trim().replace(/[^\d,.-]/g, "");
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(s);
  return isFinite(n) ? Math.round(n * 100) : 0;
}

/** Primeiro telefone válido: telefone_ativo, senão o primeiro da lista "telefones". */
function phoneOf(p: any): string | null {
  const ativo = str(p?.telefone_ativo);
  if (ativo) return ativo;
  const lista = str(p?.telefones);
  if (!lista) return null;
  return str(lista.split(/[,;/|]/)[0]);
}

export function parseTmbOrder(p: any): TmbOrder {
  const statusRaw = str(p?.status_pedido) ?? "";
  const valor = p?.valor_principal ?? p?.valor_total ?? 0;
  const parcelas = Number(p?.parcelas);
  return {
    pedido: str(p?.pedido) ?? str(p?.id) ?? "",
    status: tmbStatus(statusRaw),
    statusRaw,
    email: str(p?.email)?.toLowerCase() ?? null,
    nome: str(p?.cliente),
    telefone: phoneOf(p),
    valorCents: reaisToCents(valor),
    parcelas: Number.isFinite(parcelas) && parcelas > 0 ? parcelas : null,
    dataEfetivado: str(p?.data_efetivado) ?? str(p?.criado_em),
    lancamento: str(p?.lancamento),
    titulo: str(p?.titulo),
  };
}

/** Produto pela chave da URL; sem chave, pelo nome do lançamento/título. */
export function resolveTmbProduct(
  key: string | null | undefined,
  order: Pick<TmbOrder, "lancamento" | "titulo">,
): { key: string; product: TmbProduct } | null {
  const k = (key ?? "").trim().toLowerCase();
  if (k) {
    const product = TMB_PRODUCTS[k];
    return product ? { key: k, product } : null;
  }
  const text = `${order.lancamento ?? ""} ${order.titulo ?? ""}`;
  for (const [pk, product] of Object.entries(TMB_PRODUCTS)) {
    if (product.match.test(text)) return { key: pk, product };
  }
  return null;
}

/** Chave de idempotência: o mesmo pedido no mesmo status só é processado uma vez. */
export function tmbEventKey(order: Pick<TmbOrder, "pedido" | "status" | "statusRaw">): string {
  const st = order.status === "outro" ? normalize(order.statusRaw || "sem-status") : order.status;
  return `tmb:${order.pedido || "sem-pedido"}:${st}`;
}

/**
 * Cópia do payload sem dados pessoais desnecessários (CPF, endereço, nascimento,
 * score, avalista). Fica só o que serve para conferir a venda.
 */
const KEEP = [
  "produtor", "produtor_id", "lancamento", "lancamento_id", "titulo", "code", "id", "pedido",
  "status_pedido", "status_financeiro", "cliente", "email", "telefone_ativo",
  "valor_principal", "valor_total", "valor_entrada", "valor_parcela", "parcelas",
  "criado_em", "data_efetivado", "id_externo",
  "utm_source", "utm_medium", "utm_content", "utm_campaign",
  "utm_last_source", "utm_last_medium", "utm_last_content", "utm_last_campaign",
] as const;

export function redactTmbPayload(p: any): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!p || typeof p !== "object") return out;
  for (const k of KEEP) if (k in p) out[k] = p[k];
  return out;
}

export function tmbValidityLabel(years: number): string {
  return years === 1 ? "Anual" : `${years} anos`;
}
