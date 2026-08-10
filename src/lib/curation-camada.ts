/**
 * Utilitários da curadoria: leitura da camada técnica e decisão pendente.
 * A camada vem dentro do JSON de `ai_technical_direction` (campo `camada`).
 */

export const CAMADA_LABELS: Record<string, string> = {
  dify: "Agente",
  lovable: "Interface",
  kb: "Base de conhecimento",
  banco: "Banco de dados",
  multiplas: "Múltiplas",
};

/** Cores discretas (tokens Tailwind neutros por camada). */
export const CAMADA_BADGE_CLASS: Record<string, string> = {
  dify: "border-violet-200 bg-violet-50 text-violet-700",
  lovable: "border-sky-200 bg-sky-50 text-sky-700",
  kb: "border-emerald-200 bg-emerald-50 text-emerald-700",
  banco: "border-slate-200 bg-slate-100 text-slate-700",
  multiplas: "border-amber-200 bg-amber-50 text-amber-700",
};

export const CAMADA_ORDER = ["dify", "lovable", "kb", "banco", "multiplas"] as const;

/** Extrai a camada do JSON da direção técnica. Retorna null quando ausente/ilegível. */
export function parseCamada(technicalDirection: string | null | undefined): string | null {
  if (!technicalDirection) return null;
  try {
    const parsed = JSON.parse(technicalDirection);
    const camada = parsed?.camada;
    if (typeof camada !== "string") return null;
    const normalized = camada.trim().toLowerCase();
    return normalized ? normalized : null;
  } catch {
    return null;
  }
}

export function camadaLabel(camada: string | null): string {
  if (!camada) return "—";
  return CAMADA_LABELS[camada] ?? camada;
}

export interface DecisionFlag {
  needsDecision: boolean;
  reason: string;
}

const CLASS_LABEL: Record<string, string> = {
  suporte: "suporte",
  melhoria: "melhoria",
  requer_analise_humana: "requer análise humana",
};

const label = (value: string | null | undefined) =>
  value ? (CLASS_LABEL[value] ?? value) : "sem classificação";

/** Regras de "exige decisão humana" descritas pelo super admin. */
export function decisionFlag(row: {
  curator_agreement?: string | null;
  ai_classification: string | null;
  curator_classification: string | null;
  admin_final_classification: string | null;
}): DecisionFlag {
  if (row.curator_agreement === "discorda") {
    return {
      needsDecision: true,
      reason: `Curador discordou da IA — curador: ${label(row.curator_classification)}, IA: ${label(row.ai_classification)}.`,
    };
  }
  if (row.ai_classification === "requer_analise_humana") {
    return {
      needsDecision: true,
      reason: "A IA marcou esta solicitação como 'requer análise humana'.",
    };
  }
  if (
    !row.admin_final_classification &&
    row.ai_classification &&
    row.curator_classification &&
    row.ai_classification !== row.curator_classification
  ) {
    return {
      needsDecision: true,
      reason: `Curador classificou como ${label(row.curator_classification)}, IA como ${label(row.ai_classification)} — requer decisão do super admin.`,
    };
  }
  return { needsDecision: false, reason: "" };
}

/** Classificação final considerada: admin quando definida, senão a do curador. */
export function finalClassificationOf(row: {
  admin_final_classification: string | null;
  curator_classification: string | null;
}): string | null {
  return row.admin_final_classification || row.curator_classification || null;
}

/** Faixa lateral por classificação final. */
export function classificationStripeClass(final: string | null): string {
  if (final === "suporte") return "border-l-4 border-l-amber-500";
  if (final === "melhoria") return "border-l-4 border-l-blue-500";
  return "border-l-4 border-l-transparent";
}
