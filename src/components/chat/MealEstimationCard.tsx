import { Utensils, Flame, Beef, Wheat, Droplet } from "lucide-react";
import type { MealEstimation, MealFood } from "@/lib/meal-estimation";
import { cn } from "@/lib/utils";

function confidenceBadge(c?: string) {
  const v = (c ?? "").toLowerCase();
  if (v.startsWith("alt")) return { label: "alta", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" };
  if (v.startsWith("med") || v.startsWith("méd")) return { label: "média", cls: "bg-amber-50 text-amber-700 border-amber-200" };
  if (v.startsWith("baix")) return { label: "baixa", cls: "bg-rose-50 text-rose-700 border-rose-200" };
  return null;
}

function fmt(n?: number, digits = 1) {
  if (n === undefined || n === null || !Number.isFinite(n)) return "—";
  return digits === 0 ? Math.round(n).toString() : n.toFixed(digits).replace(".", ",");
}

export function MealEstimationCard({ data }: { data: MealEstimation }) {
  const { foods, totals } = data;
  return (
    <div className="mt-3 rounded-2xl border border-[#e8a04c]/30 bg-gradient-to-br from-[#fff8ef] to-[#fdf1f8] shadow-sm overflow-hidden">
      <div className="px-4 py-3 flex items-center gap-2 border-b border-[#e8a04c]/20 bg-white/50">
        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-[#e8a04c] to-[#e89bcf] flex items-center justify-center text-white">
          <Utensils className="h-4 w-4" />
        </div>
        <div>
          <div className="text-sm font-semibold text-foreground">Estimativa nutricional da refeição</div>
          <div className="text-[11px] text-muted-foreground">Análise visual — valores aproximados</div>
        </div>
      </div>

      {/* Totais */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 bg-white/40">
        <TotalTile icon={Flame} label="Calorias" value={`${fmt(totals.calories, 0)} kcal`} color="#e8a04c" />
        <TotalTile icon={Beef}  label="Proteínas" value={`${fmt(totals.protein_g)} g`} color="#e89bcf" />
        <TotalTile icon={Wheat} label="Carboidratos" value={`${fmt(totals.carbs_g)} g`} color="#facc15" />
        <TotalTile icon={Droplet} label="Gorduras" value={`${fmt(totals.fat_g)} g`} color="#4ade80" />
      </div>

      {/* Itens */}
      <ul className="divide-y divide-[#e8a04c]/10">
        {foods.map((f, i) => (
          <FoodRow key={i} food={f} />
        ))}
      </ul>
    </div>
  );
}

function TotalTile({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="rounded-xl bg-white border border-white shadow-sm px-3 py-2 flex items-center gap-2">
      <div className="h-8 w-8 rounded-lg flex items-center justify-center" style={{ background: `${color}20` }}>
        <Icon className="h-4 w-4" style={{ color }} />
      </div>
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{label}</div>
        <div className="text-sm font-semibold text-foreground truncate">{value}</div>
      </div>
    </div>
  );
}

function FoodRow({ food }: { food: MealFood }) {
  const badge = confidenceBadge(food.confidence);
  return (
    <li className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 bg-white/30 hover:bg-white/60 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-foreground">{food.name}</span>
          {badge && (
            <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full border font-medium", badge.cls)}>
              confiança {badge.label}
            </span>
          )}
        </div>
        {food.estimated_portion && (
          <div className="text-xs text-muted-foreground mt-0.5">Porção estimada: {food.estimated_portion}</div>
        )}
      </div>
      <div className="grid grid-cols-4 gap-2 sm:gap-3 text-center shrink-0">
        <Metric label="kcal" value={fmt(food.calories, 0)} />
        <Metric label="P" value={fmt(food.protein_g)} />
        <Metric label="C" value={fmt(food.carbs_g)} />
        <Metric label="G" value={fmt(food.fat_g)} />
      </div>
    </li>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-[44px]">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-xs font-semibold text-foreground">{value}</div>
    </div>
  );
}
