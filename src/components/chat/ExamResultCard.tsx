import { useState, type ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  LineChart,
  FlaskConical,
  ChevronDown,
  ChevronUp,
  CircleDot,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  HelpCircle,
} from "lucide-react";
import {
  classificationVisualState,
  normalizeCategory,
  type ClassificationVisualState,
} from "@/lib/exam-markers";

export interface Marker {
  name: string;
  value: string | number;
  unit?: string;
  reference?: string;
  classification?: string;
  analysis?: string;
  category?: string;
}

const stateStyles: Record<ClassificationVisualState, { badge: string; icon: ReactNode; label?: string }> = {
  otimo: {
    badge: "bg-green-100 text-green-700 border-green-200",
    icon: <CircleDot className="h-3 w-3" />,
    label: "NORMAL",
  },
  normal: {
    badge: "bg-green-100 text-green-700 border-green-200",
    icon: <CircleDot className="h-3 w-3" />,
    label: "NORMAL",
  },
  atencao: {
    badge: "bg-amber-100 text-amber-700 border-amber-200",
    icon: <AlertTriangle className="h-3 w-3" />,
  },
  levemente_baixo: {
    badge: "bg-yellow-100 text-yellow-700 border-yellow-200",
    icon: <ArrowDown className="h-3 w-3" />,
    label: "LEVEMENTE BAIXO",
  },
  levemente_alto: {
    badge: "bg-orange-100 text-orange-700 border-orange-200",
    icon: <ArrowUp className="h-3 w-3" />,
    label: "LEVEMENTE ALTO",
  },
  baixo: {
    badge: "bg-orange-100 text-orange-800 border-orange-300",
    icon: <ArrowDown className="h-3 w-3" />,
  },
  alto: {
    badge: "bg-rose-100 text-rose-700 border-rose-200",
    icon: <ArrowUp className="h-3 w-3" />,
  },
  desconhecido: {
    badge: "bg-muted text-muted-foreground",
    icon: <HelpCircle className="h-3 w-3" />,
  },
  risco_baixo: {
    badge: "bg-green-100 text-green-700 border-green-200",
    icon: <CircleDot className="h-3 w-3" />,
    label: "RISCO BAIXO",
  },
  risco_moderado: {
    badge: "bg-amber-100 text-amber-700 border-amber-200",
    icon: <AlertTriangle className="h-3 w-3" />,
    label: "RISCO MODERADO",
  },
  risco_alto: {
    badge: "bg-rose-100 text-rose-700 border-rose-200",
    icon: <AlertTriangle className="h-3 w-3" />,
    label: "RISCO ALTO",
  },
};

const CATEGORY_NAMES: Record<string, string> = {
  hemograma_anemias: "Hemograma e Anemias",
  hemograma: "Hemograma",
  perfil_lipidico: "Perfil Lipídico",
  perfil_glicidico: "Perfil Glicídico",
  perfil_tireoidiano: "Perfil Tireoidiano",
  perfil_hormonal: "Perfil Hormonal",
  vitaminas_minerais: "Vitaminas e Minerais",
  funcao_hepatica: "Função Hepática",
  funcao_renal: "Função Renal e Eletrólitos",
  coagulacao: "Coagulação",
  urinalise: "Urinálise",
  inflamatorio: "Marcadores Inflamatórios",
  // Bioimpedância
  composicao_corporal: "Composição Corporal",
  massa_gorda: "Massa Gorda",
  massa_magra: "Massa Magra",
  agua_corporal: "Água Corporal",
  risco_metabolico: "Risco Metabólico",
  angulo_de_fase: "Ângulo de Fase",
  // Genética
  metilacao: "Metilação",
  resposta_estimulos: "Resposta a Estímulos",
  eficacia_dietas: "Eficácia de Dietas",
  comportamento_alimentar: "Comportamento Alimentar",
  outros: "Outros",
};

export function ExamResultCard({ markers }: { markers: Marker[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  if (!markers?.length) return null;

  // Group markers by category (normalização defensiva: trim/lower/sem acento)
  const groups = markers.reduce((acc, m) => {
    const cat = normalizeCategory(m.category);
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(m);
    return acc;
  }, {} as Record<string, Marker[]>);

  // Ordem clínica explícita (briefing curadoria)
  const CATEGORY_ORDER = [
    "hemograma_anemias",
    "hemograma",
    "perfil_glicidico",
    "perfil_lipidico",
    "perfil_tireoidiano",
    "perfil_hormonal",
    "funcao_hepatica",
    "funcao_renal",
    "vitaminas_minerais",
    "inflamatorio",
    "metabolismo_osseo",
    "sorologia_infecciosa",
    "coagulacao",
    "urinalise",
    // Bioimpedância
    "composicao_corporal",
    "massa_gorda",
    "massa_magra",
    "agua_corporal",
    "risco_metabolico",
    "angulo_de_fase",
    // Genética
    "metilacao",
    "resposta_estimulos",
    "eficacia_dietas",
    "comportamento_alimentar",
    "outros",
  ];
  const categories = Object.keys(groups).sort((a, b) => {
    const ia = CATEGORY_ORDER.indexOf(a);
    const ib = CATEGORY_ORDER.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });

  return (
    <Card className="rounded-lg border-muted-foreground/10 shadow-md">
      <CardHeader className="flex flex-row items-center gap-2 pb-3">
        <FlaskConical className="h-4 w-4 text-[#3d5a4a]" />
        <CardTitle className="text-base">Marcadores do exame</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y">
          {categories.map((cat) => (
            <div key={cat} className="group">
              <div className="bg-muted/30 px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {CATEGORY_NAMES[cat] || cat}
              </div>
              <div className="divide-y divide-muted/50">
                {groups[cat].map((m, i) => {
                  let state = classificationVisualState(m.classification);
                  const mId = `${cat}-${m.name}-${i}`;
                  const isOpen = openId === mId;
                  const hasAnalysis = !!m.analysis?.toString().trim();
                  const refText = m.reference?.toString().trim();
                  const notIndexed = !!refText && /n[ãa]o\s+indexado/i.test(refText);
                  const showRef = !!refText && !notIndexed;
                  // Referência textual (sem dígitos): traduzir alto/baixo/atenção → "alterado"
                  const isTextualRef = !!refText && !/\d/.test(refText);
                  let textualLabelOverride: string | undefined;
                  let styleOverride: typeof stateStyles[ClassificationVisualState] | undefined;
                  if (isTextualRef && (state === "alto" || state === "baixo" || state === "levemente_alto" || state === "levemente_baixo" || state === "atencao")) {
                    textualLabelOverride = "ALTERADO";
                    styleOverride = {
                      badge: "bg-amber-100 text-amber-700 border-amber-200",
                      icon: <AlertTriangle className="h-3 w-3" />,
                    };
                  }
                  const style = styleOverride ?? stateStyles[state];
                  const showBadge = !!m.classification && state !== "desconhecido";

                  return (
                    <div key={mId} className="px-4 py-3 bg-white/40">
                      <button
                        type="button"
                        onClick={() => hasAnalysis && setOpenId(isOpen ? null : mId)}
                        className="flex w-full items-center justify-between gap-3 text-left"
                        disabled={!hasAnalysis}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium truncate">{m.name}</div>
                          {showRef && (
                            <div
                              className="text-xs text-muted-foreground line-clamp-2 break-words"
                              title={refText}
                            >
                              Ref.: {refText}
                            </div>
                          )}
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-semibold tabular-nums">
                            {m.value}{" "}
                            {m.unit && (
                              <span className="text-muted-foreground font-normal">
                                {m.unit}
                              </span>
                            )}
                          </div>
                          {showBadge && (
                            <Badge
                              variant="outline"
                              className={`mt-1 inline-flex items-center gap-1 text-[10px] uppercase tracking-wide ${style.badge}`}
                            >
                              {style.icon}
                              {textualLabelOverride || style.label || m.classification}
                            </Badge>
                          )}
                        </div>
                        {hasAnalysis && (
                          <span className="text-muted-foreground">
                            {isOpen ? (
                              <ChevronUp className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                          </span>
                        )}
                      </button>

                      {hasAnalysis && isOpen && (
                        <div className="mt-3 rounded-md bg-muted/40 p-3 text-xs leading-relaxed text-foreground/80">
                          {m.analysis}
                          <div className="mt-3 flex justify-end">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="rounded-full text-xs gap-1"
                              disabled
                            >
                              <LineChart className="h-3.5 w-3.5" /> Ver evolução
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
