import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LineChart, FlaskConical } from "lucide-react";

export interface Marker {
  name: string;
  value: string | number;
  unit?: string;
  reference?: string;
  classification?: "normal" | "alto" | "baixo" | "atencao" | string;
}

const classBadge: Record<string, string> = {
  normal: "bg-emerald-100 text-emerald-700 border-emerald-200",
  alto: "bg-rose-100 text-rose-700 border-rose-200",
  baixo: "bg-amber-100 text-amber-700 border-amber-200",
  atencao: "bg-amber-100 text-amber-700 border-amber-200",
};

export function ExamResultCard({ markers }: { markers: Marker[] }) {
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
            const cls = (m.classification ?? "").toLowerCase();
            return (
              <div
                key={`${m.name}-${i}`}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{m.name}</div>
                  {m.reference && (
                    <div className="text-xs text-muted-foreground truncate">
                      Ref.: {m.reference}
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold tabular-nums">
                    {m.value} {m.unit && <span className="text-muted-foreground font-normal">{m.unit}</span>}
                  </div>
                  {m.classification && (
                    <Badge
                      variant="outline"
                      className={`mt-1 text-[10px] uppercase tracking-wide ${classBadge[cls] ?? "bg-muted text-muted-foreground"}`}
                    >
                      {m.classification}
                    </Badge>
                  )}
                </div>
                <Button variant="ghost" size="sm" className="rounded-full text-xs gap-1" disabled>
                  <LineChart className="h-3.5 w-3.5" /> Ver evolução
                </Button>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
