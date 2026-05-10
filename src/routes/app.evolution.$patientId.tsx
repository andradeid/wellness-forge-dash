import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, TrendingUp, TrendingDown, Minus, Activity, User } from "lucide-react";
import { format, differenceInYears } from "date-fns";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceArea,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/evolution/$patientId")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/login" });
  },
  head: () => ({
    meta: [{ title: "Evolução do paciente — Lumma" }],
  }),
  component: EvolutionPage,
});

interface PatientCtx {
  id: string;
  name: string;
  birth_date: string | null;
  gender: string | null;
}

interface ResultRow {
  id: string;
  marker_name: string;
  marker_value: number | null;
  marker_value_raw: string | null;
  marker_unit: string | null;
  reference_value: string | null;
  classification: string | null;
  analysis: string | null;
  measured_at: string;
}

interface MarkerGroup {
  name: string;
  unit: string | null;
  points: ResultRow[];
  latest: ResultRow;
  trend: "up" | "down" | "flat" | "none";
  delta: number | null;
}

function classificationTone(c: string | null): {
  label: string;
  className: string;
} {
  const t = (c ?? "").toLowerCase();
  if (/(alto|elevad|acima|alterad)/.test(t))
    return { label: c ?? "—", className: "bg-rose-50 text-rose-700 border-rose-200" };
  if (/(baixo|abaixo|deficien)/.test(t))
    return { label: c ?? "—", className: "bg-amber-50 text-amber-700 border-amber-200" };
  if (/(normal|adequad|dentro|preserv|esperad|ótim|otim)/.test(t))
    return { label: c ?? "—", className: "bg-emerald-50 text-emerald-700 border-emerald-200" };
  return { label: c ?? "—", className: "bg-slate-100 text-slate-700 border-slate-200" };
}

function parseReferenceRange(ref: string | null): { min: number; max: number } | null {
  if (!ref) return null;
  const cleaned = ref.replace(/\s+/g, "").replace(",", ".");
  const m = cleaned.match(/(-?\d+(?:\.\d+)?)[^\d-]+(-?\d+(?:\.\d+)?)/);
  if (!m) return null;
  const min = parseFloat(m[1]);
  const max = parseFloat(m[2]);
  if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) return null;
  return { min, max };
}

function EvolutionPage() {
  const { patientId } = Route.useParams();
  const [patient, setPatient] = useState<PatientCtx | null>(null);
  const [rows, setRows] = useState<ResultRow[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any)
        .from("patients")
        .select("id, name, birth_date, gender")
        .eq("id", patientId)
        .maybeSingle();
      setPatient(data as PatientCtx | null);
    })();
  }, [patientId]);

  useEffect(() => {
    (async () => {
      const { data, error } = await (supabase as any)
        .from("patient_exam_results")
        .select(
          "id, marker_name, marker_value, marker_value_raw, marker_unit, reference_value, classification, analysis, measured_at",
        )
        .eq("patient_id", patientId)
        .order("measured_at", { ascending: true });
      if (error) {
        console.error("[Evolução] Falha ao carregar marcadores:", error);
        setRows([]);
        return;
      }
      setRows((data as ResultRow[]) ?? []);
    })();
  }, [patientId]);

  const groups = useMemo<MarkerGroup[]>(() => {
    if (!rows) return [];
    const map = new Map<string, ResultRow[]>();
    for (const r of rows) {
      const key = r.marker_name.trim();
      if (!key) continue;
      const arr = map.get(key) ?? [];
      arr.push(r);
      map.set(key, arr);
    }
    const out: MarkerGroup[] = [];
    for (const [name, points] of map.entries()) {
      points.sort((a, b) => a.measured_at.localeCompare(b.measured_at));
      const latest = points[points.length - 1];
      const previous = points.length > 1 ? points[points.length - 2] : null;
      let trend: MarkerGroup["trend"] = "none";
      let delta: number | null = null;
      if (
        previous &&
        previous.marker_value != null &&
        latest.marker_value != null
      ) {
        delta = latest.marker_value - previous.marker_value;
        if (Math.abs(delta) < 1e-9) trend = "flat";
        else trend = delta > 0 ? "up" : "down";
      }
      out.push({
        name,
        unit: latest.marker_unit,
        points,
        latest,
        trend,
        delta,
      });
    }
    out.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    return out;
  }, [rows]);

  useEffect(() => {
    if (!selected && groups.length) setSelected(groups[0].name);
  }, [groups, selected]);

  const active = groups.find((g) => g.name === selected) ?? null;
  const age = patient?.birth_date
    ? differenceInYears(new Date(), new Date(patient.birth_date))
    : null;

  return (
    <div className="flex h-screen w-full bg-[#f5f5f0] overflow-hidden">
      <aside className="hidden lg:flex w-80 flex-col border-r bg-white shrink-0">
        <div className="px-5 py-4 border-b">
          <Link
            to="/app/chat/$patientId"
            params={{ patientId }}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3 w-3" /> Voltar ao chat
          </Link>
          <div className="mt-3 flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] flex items-center justify-center text-white">
              <User className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="font-medium truncate">{patient?.name ?? "…"}</div>
              <div className="text-xs text-muted-foreground">
                {age !== null ? `${age} anos` : "—"}
                {patient?.gender ? ` · ${patient.gender}` : ""}
              </div>
            </div>
          </div>
        </div>
        <div className="px-3 py-3 border-b flex-1 min-h-0 flex flex-col">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground px-3 mb-2">
            Marcadores ({groups.length})
          </div>
          <div className="overflow-y-auto flex-1 -mx-1 px-1">
            {rows === null ? (
              <div className="space-y-2 px-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : groups.length === 0 ? (
              <p className="text-xs text-muted-foreground px-3 py-6">
                Nenhum marcador registrado ainda. Envie um exame pelo chat para começar.
              </p>
            ) : (
              <ul className="space-y-1">
                {groups.map((g) => {
                  const isActive = g.name === selected;
                  const tone = classificationTone(g.latest.classification);
                  return (
                    <li key={g.name}>
                      <button
                        type="button"
                        onClick={() => setSelected(g.name)}
                        className={cn(
                          "w-full text-left rounded-lg px-3 py-2 transition border",
                          isActive
                            ? "bg-[#f5f5f0] border-[#e8a04c]/40"
                            : "border-transparent hover:bg-muted/40",
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium truncate">{g.name}</span>
                          {g.trend === "up" && <TrendingUp className="h-3.5 w-3.5 text-rose-500 shrink-0" />}
                          {g.trend === "down" && <TrendingDown className="h-3.5 w-3.5 text-emerald-600 shrink-0" />}
                          {g.trend === "flat" && <Minus className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                        </div>
                        <div className="mt-1 flex items-center justify-between gap-2">
                          <span className="text-xs text-muted-foreground truncate">
                            {g.latest.marker_value_raw ?? g.latest.marker_value ?? "—"}
                            {g.unit ? ` ${g.unit}` : ""} · {g.points.length}x
                          </span>
                          <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", tone.className)}>
                            {tone.label}
                          </Badge>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </aside>

      <section className="flex-1 flex flex-col min-w-0 h-full overflow-y-auto">
        <header className="px-6 py-5 border-b bg-white shrink-0">
          <h1
            className="text-2xl bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] bg-clip-text text-transparent"
            style={{ fontFamily: "'Instrument Serif', serif" }}
          >
            Evolução clínica
          </h1>
          <p className="text-xs text-muted-foreground">
            Acompanhe a variação dos marcadores ao longo do tempo a partir dos exames enviados.
          </p>
        </header>

        <div className="p-6 space-y-6">
          {rows === null ? (
            <Skeleton className="h-80 w-full rounded-xl" />
          ) : !active ? (
            <Card className="p-10 text-center">
              <Activity className="h-10 w-10 mx-auto text-muted-foreground/60" />
              <p className="mt-3 text-sm text-muted-foreground">
                Sem dados para exibir. Envie um exame pelo chat para começar a evolução.
              </p>
            </Card>
          ) : (
            <MarkerDetail group={active} />
          )}
        </div>
      </section>
    </div>
  );
}

function MarkerDetail({ group }: { group: MarkerGroup }) {
  const range = parseReferenceRange(group.latest.reference_value);
  const data = group.points
    .filter((p) => p.marker_value != null)
    .map((p) => ({
      date: format(new Date(p.measured_at), "dd/MM/yy"),
      value: p.marker_value as number,
      classification: p.classification,
      raw: p.marker_value_raw,
      analysis: p.analysis,
    }));

  const yValues = data.map((d) => d.value);
  const minY = Math.min(...yValues, range?.min ?? Infinity);
  const maxY = Math.max(...yValues, range?.max ?? -Infinity);
  const pad = (maxY - minY || maxY || 1) * 0.15;
  const tone = classificationTone(group.latest.classification);

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">{group.name}</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Referência: {group.latest.reference_value ?? "não informada"}
              {group.unit ? ` · Unidade: ${group.unit}` : ""}
            </p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-semibold">
              {group.latest.marker_value_raw ?? group.latest.marker_value}
              <span className="text-sm font-normal text-muted-foreground ml-1">
                {group.unit ?? ""}
              </span>
            </div>
            <Badge variant="outline" className={cn("mt-1", tone.className)}>
              {tone.label}
            </Badge>
            {group.delta !== null && (
              <div className="mt-1 text-xs text-muted-foreground inline-flex items-center gap-1">
                {group.trend === "up" && <TrendingUp className="h-3 w-3 text-rose-500" />}
                {group.trend === "down" && <TrendingDown className="h-3 w-3 text-emerald-600" />}
                {group.trend === "flat" && <Minus className="h-3 w-3" />}
                {group.delta > 0 ? "+" : ""}
                {group.delta.toFixed(2)} desde a medição anterior
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 h-72">
          {data.length === 0 ? (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
              Este marcador não possui valores numéricos para plotar.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 10, right: 24, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="lummaLine" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#e8a04c" />
                    <stop offset="100%" stopColor="#e89bcf" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="#94a3b8" />
                <YAxis
                  domain={[Math.floor(minY - pad), Math.ceil(maxY + pad)]}
                  tick={{ fontSize: 12 }}
                  stroke="#94a3b8"
                />
                {range && (
                  <ReferenceArea
                    y1={range.min}
                    y2={range.max}
                    fill="#10b981"
                    fillOpacity={0.08}
                    stroke="#10b981"
                    strokeOpacity={0.2}
                  />
                )}
                <Tooltip
                  contentStyle={{
                    borderRadius: 8,
                    border: "1px solid #e5e7eb",
                    fontSize: 12,
                  }}
                  formatter={(v: number) => [`${v} ${group.unit ?? ""}`, group.name]}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="url(#lummaLine)"
                  strokeWidth={3}
                  dot={{ r: 5, fill: "#e8a04c", stroke: "white", strokeWidth: 2 }}
                  activeDot={{ r: 7 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="px-6 py-3 border-b bg-muted/30">
          <h3 className="text-sm font-semibold">Histórico de medições</h3>
        </div>
        <div className="divide-y">
          {[...group.points].reverse().map((p) => {
            const t = classificationTone(p.classification);
            return (
              <div key={p.id} className="px-6 py-3 flex items-start gap-4">
                <div className="text-xs text-muted-foreground w-24 shrink-0">
                  {format(new Date(p.measured_at), "dd/MM/yyyy")}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">
                      {p.marker_value_raw ?? p.marker_value}
                      {p.marker_unit ? ` ${p.marker_unit}` : ""}
                    </span>
                    <Badge variant="outline" className={cn("text-[10px]", t.className)}>
                      {t.label}
                    </Badge>
                    {p.reference_value && (
                      <span className="text-[11px] text-muted-foreground">
                        ref. {p.reference_value}
                      </span>
                    )}
                  </div>
                  {p.analysis && (
                    <p className="text-xs text-muted-foreground mt-1">{p.analysis}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
