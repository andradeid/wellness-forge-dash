import { useState, type ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  LineChart,
  FlaskConical,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Sparkles,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  HelpCircle,
} from "lucide-react";
import {
  classificationVisualState,
  type ClassificationVisualState,
} from "@/lib/exam-markers";

export interface Marker {
  name: string;
  value: string | number;
  unit?: string;
  reference?: string;
  classification?: string;
  analysis?: string;
}

const stateStyles: Record<ClassificationVisualState, { badge: string; icon: JSX.Element }> = {
  otimo: {
    badge: "bg-emerald-600 text-white border-emerald-700",
    icon: <Sparkles className="h-3 w-3" />,
  },
  normal: {
    badge: "bg-emerald-100 text-emerald-700 border-emerald-200",
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  atencao: {
    badge: "bg-amber-100 text-amber-700 border-amber-200",
    icon: <AlertTriangle className="h-3 w-3" />,
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
};

export function ExamResultCard({ markers }: { markers: Marker[] }) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  if (!markers?.length) return null;

  return (
    <Card className="rounded-lg border-muted-foreground/10 shadow-md">
      <CardHeader className="flex flex-row items-center gap-2 pb-3">
        <FlaskConical className="h-4 w-4 text-[#3d5a4a]" />
        <CardTitle className="text-base">Marcadores do exame</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y">
          {markers.map((m, i) => {
            const state = classificationVisualState(m.classification);
            const style = stateStyles[state];
            const isOpen = openIdx === i;
            const hasAnalysis = !!m.analysis?.toString().trim();
            const refText = m.reference?.toString().trim();

            return (
              <div key={`${m.name}-${i}`} className="px-4 py-3">
                <button
                  type="button"
                  onClick={() => hasAnalysis && setOpenIdx(isOpen ? null : i)}
                  className="flex w-full items-center justify-between gap-3 text-left"
                  disabled={!hasAnalysis}
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{m.name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      Ref. BC: {refText || "—"}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold tabular-nums">
                      {m.value}{" "}
                      {m.unit && (
                        <span className="text-muted-foreground font-normal">{m.unit}</span>
                      )}
                    </div>
                    {m.classification && (
                      <Badge
                        variant="outline"
                        className={`mt-1 inline-flex items-center gap-1 text-[10px] uppercase tracking-wide ${style.badge}`}
                      >
                        {style.icon}
                        {m.classification}
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
      </CardContent>
    </Card>
  );
}
