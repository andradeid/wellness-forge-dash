import { Scale, Ruler, Dumbbell, Activity, Eye } from "lucide-react";
import type { BodyAssessment, BodyVisualIndicator } from "@/lib/body-assessment";
import { cn } from "@/lib/utils";

function confidenceBadge(c?: string) {
  const v = (c ?? "").toLowerCase();
  if (v.startsWith("alt")) return { label: "alta", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" };
  if (v.startsWith("med") || v.startsWith("méd")) return { label: "média", cls: "bg-amber-50 text-amber-700 border-amber-200" };
  if (v.startsWith("baix")) return { label: "baixa", cls: "bg-rose-50 text-rose-700 border-rose-200" };
  return null;
}

function classificationCls(c?: string) {
  const v = (c ?? "").toLowerCase();
  if (/(ótim|otim|adequad|normal|bom|saud)/.test(v)) return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (/(atenç|atenc|moderad|leve)/.test(v)) return "bg-amber-50 text-amber-700 border-amber-200";
  if (/(alterad|elevad|reduz|baix|risc|crític|critic)/.test(v)) return "bg-rose-50 text-rose-700 border-rose-200";
  return "bg-slate-50 text-slate-700 border-slate-200";
}

export function BodyAssessmentCard({ data }: { data: BodyAssessment }) {
  const badge = confidenceBadge(data.confidence);
  const indicators: BodyVisualIndicator[] = Array.isArray(data.visual_indicators) ? data.visual_indicators : [];

  return (
    <div className="mt-3 rounded-2xl border border-[#e8a04c]/30 bg-gradient-to-br from-[#fff8ef] to-[#fdf1f8] shadow-sm overflow-hidden">
      <div className="px-4 py-3 flex items-center gap-2 border-b border-[#e8a04c]/20 bg-white/50">
        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-[#e8a04c] to-[#e89bcf] flex items-center justify-center text-white">
          <Scale className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-foreground">Composição corporal por foto</div>
          <div className="text-[11px] text-muted-foreground">Análise visual — estimativa aproximada</div>
        </div>
        {badge && (
          <span className={cn("text-[10px] px-2 py-0.5 rounded-full border font-medium", badge.cls)}>
            confiança {badge.label}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-3 bg-white/40">
        <InfoTile icon={Ruler} label="Distribuição de gordura" value={data.fat_distribution} color="#e8a04c" />
        <InfoTile icon={Activity} label="Faixa estimada de %GC" value={data.estimated_bf_range} color="#e89bcf" />
        <InfoTile icon={Dumbbell} label="Desenvolvimento muscular" value={data.muscle_development} color="#4ade80" />
        <InfoTile icon={Eye} label="Postura" value={data.posture_notes} color="#60a5fa" />
      </div>

      {indicators.length > 0 && (
        <div className="border-t border-[#e8a04c]/20 bg-white/30">
          <div className="px-4 pt-3 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
            Indicadores visuais
          </div>
          <ul className="divide-y divide-[#e8a04c]/10">
            {indicators.map((ind, i) => (
              <li key={i} className="px-4 py-2.5 flex flex-col sm:flex-row sm:items-start gap-1.5 sm:gap-3">
                <div className="sm:w-32 shrink-0 text-xs font-semibold text-foreground">{ind.area}</div>
                <div className="flex-1 min-w-0 text-xs text-foreground/80 text-justify">{ind.observation}</div>
                {ind.classification && (
                  <span className={cn("shrink-0 self-start text-[10px] px-1.5 py-0.5 rounded-full border font-medium", classificationCls(ind.classification))}>
                    {ind.classification}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function InfoTile({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  label: string;
  value?: string;
  color: string;
}) {
  if (!value) return null;
  return (
    <div className="rounded-xl bg-white border border-white shadow-sm px-3 py-2 flex items-start gap-2">
      <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${color}20` }}>
        <Icon className="h-4 w-4" style={{ color }} />
      </div>
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{label}</div>
        <div className="text-xs font-medium text-foreground leading-snug">{value}</div>
      </div>
    </div>
  );
}
