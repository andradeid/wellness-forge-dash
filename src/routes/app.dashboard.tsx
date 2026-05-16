import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Users,
  Activity,
  AlertTriangle,
  TrendingDown,
  ArrowRight,
  Sparkles,
  Plus,
  Cake,
  Clock,
} from "lucide-react";

// Ícones com peso visual leve e tamanho uniforme em toda a página
const ICON_PROPS = { strokeWidth: 1.6 } as const;
import { differenceInCalendarDays, format, startOfDay, startOfMonth, startOfWeek, subDays } from "date-fns";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { QuickAnalysisDialog } from "@/components/QuickAnalysisDialog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/dashboard")({
  head: () => ({
    meta: [{ title: "Dashboard — Lumma" }],
  }),
  component: DashboardPage,
});

type Bucket = "otimo" | "atencao" | "critico" | "neutro";

function classify(c: string | null): Bucket {
  const t = (c ?? "").toLowerCase();
  if (/(crítico|critico|grave|severo|muito alto|muito baixo|deficien)/.test(t)) return "critico";
  if (/(alto|elevad|acima|baixo|abaixo|alterad|atenç|atenc|limítr|limitr)/.test(t)) return "atencao";
  if (/(normal|adequad|dentro|preserv|esperad|ótim|otim|ideal)/.test(t)) return "otimo";
  return "neutro";
}

const BUCKET_META: Record<Bucket, { label: string; color: string }> = {
  otimo: { label: "Ótimo / Normal", color: "#10b981" },
  atencao: { label: "Atenção", color: "#f59e0b" },
  critico: { label: "Crítico", color: "#ef4444" },
  neutro: { label: "Sem classificação", color: "#94a3b8" },
};

interface ResultRow {
  id: string;
  patient_id: string;
  marker_name: string;
  marker_value_raw: string | null;
  marker_unit: string | null;
  classification: string | null;
  measured_at: string;
}

interface PatientLite {
  id: string;
  name: string;
  birth_date: string | null;
  created_at: string;
}

type RangeKey = "today" | "week" | "month" | "all";

const RANGE_OPTIONS: Array<{ key: RangeKey; label: string }> = [
  { key: "today", label: "Hoje" },
  { key: "week", label: "Esta semana" },
  { key: "month", label: "Este mês" },
  { key: "all", label: "Tudo" },
];

function rangeStartIso(key: RangeKey): string | null {
  const now = new Date();
  if (key === "today") return startOfDay(now).toISOString();
  if (key === "week") return startOfWeek(now, { weekStartsOn: 1 }).toISOString();
  if (key === "month") return startOfMonth(now).toISOString();
  return null;
}

function DashboardPage() {
  const { user, profile, role, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<RangeKey>("month");
  const [patients, setPatients] = useState<PatientLite[]>([]);
  const [results, setResults] = useState<ResultRow[]>([]);
  const [examsThisMonth, setExamsThisMonth] = useState(0);

  useEffect(() => {
    if (!authLoading && role === "super_admin") {
      navigate({ to: "/app/admin/nutritionists", replace: true });
    }
  }, [authLoading, role, navigate]);

  useEffect(() => {
    if (!user || role === "super_admin") return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const startIso = rangeStartIso(range);

      const examsQuery = (supabase as any)
        .from("patient_exams")
        .select("id", { count: "exact", head: true })
        .eq("uploaded_by", user.id);
      if (startIso) examsQuery.gte("created_at", startIso);

      const [{ data: pts }, { data: res }, { count: examCount }] = await Promise.all([
        (supabase as any)
          .from("patients")
          .select("id, name")
          .eq("created_by", user.id),
        (supabase as any)
          .from("patient_exam_results")
          .select(
            "id, patient_id, marker_name, marker_value_raw, marker_unit, classification, measured_at",
          )
          .eq("created_by", user.id)
          .order("measured_at", { ascending: false })
          .limit(1000),
        examsQuery,
      ]);

      if (cancelled) return;
      setPatients((pts as PatientLite[]) ?? []);
      setResults((res as ResultRow[]) ?? []);
      setExamsThisMonth(examCount ?? 0);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, role, range]);

  if (role === "super_admin") return null;

  const patientMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of patients) m.set(p.id, p.name);
    return m;
  }, [patients]);

  const filteredResults = useMemo(() => {
    const startIso = rangeStartIso(range);
    if (!startIso) return results;
    return results.filter((r) => r.measured_at >= startIso);
  }, [results, range]);

  const stats = useMemo(() => {
    const dist: Record<Bucket, number> = { otimo: 0, atencao: 0, critico: 0, neutro: 0 };
    for (const r of filteredResults) dist[classify(r.classification)]++;

    const last24h = subDays(new Date(), 1).toISOString();
    const criticalLast24 = results.filter(
      (r) => r.measured_at >= last24h && classify(r.classification) === "critico",
    ).length;

    return {
      totalPatients: patients.length,
      examsThisMonth,
      criticalLast24,
      distribution: (Object.keys(dist) as Bucket[]).map((k) => ({
        name: BUCKET_META[k].label,
        value: dist[k],
        color: BUCKET_META[k].color,
        bucket: k,
      })),
      totalAnalyzed: filteredResults.length,
    };
  }, [filteredResults, results, patients.length, examsThisMonth]);

  const topDeficiencies = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of filteredResults) {
      if (classify(r.classification) === "atencao" || classify(r.classification) === "critico") {
        const t = (r.classification ?? "").toLowerCase();
        if (/(baixo|abaixo|deficien)/.test(t)) {
          counts.set(r.marker_name, (counts.get(r.marker_name) ?? 0) + 1);
        }
      }
    }
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [filteredResults]);

  const attentionList = useMemo(() => {
    // Agrupa por paciente: cada paciente aparece uma vez,
    // com o marcador mais grave + contagem total de alertas.
    const byPatient = new Map<
      string,
      {
        patient_id: string;
        patientName: string;
        critical: number;
        attention: number;
        top: ResultRow & { bucket: Bucket };
        lastAt: string;
      }
    >();
    for (const r of filteredResults) {
      const b = classify(r.classification);
      if (b !== "critico" && b !== "atencao") continue;
      const cur = byPatient.get(r.patient_id);
      if (!cur) {
        byPatient.set(r.patient_id, {
          patient_id: r.patient_id,
          patientName: patientMap.get(r.patient_id) ?? "Paciente",
          critical: b === "critico" ? 1 : 0,
          attention: b === "atencao" ? 1 : 0,
          top: { ...r, bucket: b },
          lastAt: r.measured_at,
        });
      } else {
        if (b === "critico") cur.critical++;
        else cur.attention++;
        // Promove para crítico se ainda não for, ou mantém o mais recente
        if (cur.top.bucket !== "critico" && b === "critico") {
          cur.top = { ...r, bucket: b };
        }
        if (r.measured_at > cur.lastAt) cur.lastAt = r.measured_at;
      }
    }
    return Array.from(byPatient.values())
      .sort((a, b) => {
        if (b.critical !== a.critical) return b.critical - a.critical;
        if (b.attention !== a.attention) return b.attention - a.attention;
        return b.lastAt.localeCompare(a.lastAt);
      })
      .slice(0, 6);
  }, [filteredResults, patientMap]);

  const greeting = (() => {
    // Hora de Brasília (UTC−3), independente do fuso do navegador
    const hourStr = new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      hour12: false,
    }).format(new Date());
    const h = parseInt(hourStr, 10);
    const t = h >= 5 && h < 12 ? "Bom dia" : h >= 12 && h < 18 ? "Boa tarde" : "Boa noite";
    const name = profile?.full_name?.split(" ")[0] ?? "";
    const pronoun = profile?.pronoun?.trim();
    if (!name) return `${t}.`;
    return pronoun ? `${t}, ${pronoun} ${name}.` : `${t}, ${name}.`;
  })();

  return (
    <div className="space-y-8 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-5">
        <div>
          <h1
            className="text-3xl bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] bg-clip-text text-transparent"
            style={{ fontFamily: "'Instrument Serif', serif" }}
          >
            {greeting}
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
            {stats.criticalLast24 > 0
              ? `Você tem ${stats.criticalLast24} alerta${stats.criticalLast24 > 1 ? "s" : ""} crítico${stats.criticalLast24 > 1 ? "s" : ""} nas últimas 24h.`
              : "Tudo calmo por aqui. Continue acompanhando suas pacientes."}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="inline-flex rounded-full bg-muted/60 p-1">
            {RANGE_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setRange(opt.key)}
                className={cn(
                  "px-4 py-1.5 text-xs font-medium rounded-full transition-all",
                  range === opt.key
                    ? "bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] text-white shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {role === "nutri" && (
            <Button
              asChild
              className="rounded-full bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] text-white shadow hover:opacity-90"
            >
              <Link to="/app/patients">
                <Plus className="h-[18px] w-[18px]" {...ICON_PROPS} />
                Novo Chat
              </Link>
            </Button>
          )}
          <QuickAnalysisDialog onCreated={() => window.location.reload()} />
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <KpiCard
          icon={<Users className="h-5 w-5" {...ICON_PROPS} />}
          label="Vidas impactadas"
          value={stats.totalPatients}
          hint="Pacientes ativos na sua base"
          tone="sage"
          loading={loading}
        />
        <KpiCard
          icon={<Activity className="h-5 w-5" {...ICON_PROPS} />}
          label={`Exames · ${RANGE_OPTIONS.find((o) => o.key === range)?.label ?? ""}`}
          value={stats.examsThisMonth}
          hint={range === "all" ? "Histórico completo" : RANGE_OPTIONS.find((o) => o.key === range)?.label}
          tone="brand"
          loading={loading}
        />
        <KpiCard
          icon={<AlertTriangle className="h-5 w-5" {...ICON_PROPS} />}
          label="Alertas críticos (24h)"
          value={stats.criticalLast24}
          hint="Marcadores graves recentes"
          tone={stats.criticalLast24 > 0 ? "danger" : "sage"}
          loading={loading}
        />
        <KpiCard
          icon={<TrendingDown className="h-5 w-5" {...ICON_PROPS} />}
          label="Marcadores analisados"
          value={stats.totalAnalyzed}
          hint="Total auditado pela Lumma"
          tone="neutral"
          loading={loading}
        />
      </div>

      {/* Bento grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Distribution */}
        <Card className="p-6 lg:col-span-1">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold">Saúde da base</h2>
            <span className="text-xs text-muted-foreground">{stats.totalAnalyzed} marcadores</span>
          </div>
          <p className="text-xs text-muted-foreground mb-4">
            Distribuição da última leitura por classificação.
          </p>
          {loading ? (
            <Skeleton className="h-56 w-full" />
          ) : stats.totalAnalyzed === 0 ? (
            <EmptyState text="Sem marcadores ainda. Envie um exame para começar." />
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={stats.distribution.filter((d) => d.value > 0)}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                  >
                    {stats.distribution.map((d) => (
                      <Cell key={d.bucket} fill={d.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend
                    wrapperStyle={{ fontSize: 11 }}
                    iconType="circle"
                    align="center"
                    verticalAlign="bottom"
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        {/* Attention list */}
        <Card className="p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold">Atenção prioritária</h2>
              <p className="text-xs text-muted-foreground">
                Pacientes com marcadores em alerta ou crítico.
              </p>
            </div>
            <Badge variant="outline" className="text-[10px]">
              {attentionList.length}
            </Badge>
          </div>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : attentionList.length === 0 ? (
            <EmptyState text="Nenhum alerta no momento. Tudo dentro do esperado." />
          ) : (
            <ul className="divide-y">
              {attentionList.map((p) => {
                const b = p.top.bucket;
                const totalAlerts = p.critical + p.attention;
                return (
                  <li key={p.patient_id} className="py-3 flex items-center gap-3">
                    <span
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{ background: BUCKET_META[b].color }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium truncate">
                          {p.patientName}
                        </span>
                        {p.critical > 0 && (
                          <Badge className="bg-rose-100 text-rose-700 hover:bg-rose-100 text-[10px] h-4 px-1.5">
                            {p.critical} crítico{p.critical > 1 ? "s" : ""}
                          </Badge>
                        )}
                        {p.attention > 0 && (
                          <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 text-[10px] h-4 px-1.5">
                            {p.attention} atenção
                          </Badge>
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
                        {p.top.marker_name}: <strong>{p.top.marker_value_raw}</strong>
                        {p.top.marker_unit ? ` ${p.top.marker_unit}` : ""} ·{" "}
                        <span
                          className={cn(
                            "font-medium",
                            b === "critico" ? "text-rose-600" : "text-amber-600",
                          )}
                        >
                          {p.top.classification}
                        </span>{" "}
                        · {format(new Date(p.lastAt), "dd/MM/yyyy")}
                        {totalAlerts > 1 ? ` · ${totalAlerts} marcadores` : ""}
                      </div>
                    </div>
                    <Link
                      to="/app/evolution/$patientId"
                      params={{ patientId: p.patient_id }}
                    >
                      <Button size="sm" variant="ghost" className="rounded-full gap-1">
                        Abrir <ArrowRight className="h-3.5 w-3.5" {...ICON_PROPS} />
                      </Button>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* Top deficiencies */}
        <Card className="p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold">Top 5 deficiências da base</h2>
              <p className="text-xs text-muted-foreground">
                Marcadores classificados como baixos / deficientes na sua base.
              </p>
            </div>
            <Sparkles className="h-4 w-4 text-[#e8a04c]" {...ICON_PROPS} />
          </div>
          {loading ? (
            <Skeleton className="h-56 w-full" />
          ) : topDeficiencies.length === 0 ? (
            <EmptyState text="Nenhuma deficiência detectada nos exames analisados." />
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topDeficiencies} layout="vertical" margin={{ left: 16 }}>
                  <defs>
                    <linearGradient id="defBar" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#e8a04c" />
                      <stop offset="100%" stopColor="#e89bcf" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e7eb" />
                  <XAxis type="number" tick={{ fontSize: 11 }} stroke="#94a3b8" allowDecimals={false} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={140}
                    tick={{ fontSize: 12 }}
                    stroke="#475569"
                  />
                  <Tooltip formatter={(v: number) => [`${v} ocorrências`, "Total"]} />
                  <Bar dataKey="count" fill="url(#defBar)" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        {/* Recent activity */}
        <Card className="p-6 lg:col-span-1">
          <h2 className="text-sm font-semibold mb-1">Últimas análises</h2>
          <p className="text-xs text-muted-foreground mb-4">Mais recentes da Lumma.</p>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : filteredResults.length === 0 ? (
            <EmptyState text="Nada por aqui no período selecionado." />
          ) : (
            <ul className="space-y-2 text-xs">
              {filteredResults.slice(0, 6).map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2">
                  <Link
                    to="/app/evolution/$patientId"
                    params={{ patientId: r.patient_id }}
                    className="truncate hover:underline"
                  >
                    <span className="font-medium">{patientMap.get(r.patient_id) ?? "—"}</span>
                    <span className="text-muted-foreground"> · {r.marker_name}</span>
                  </Link>
                  <span className="text-muted-foreground shrink-0">
                    {format(new Date(r.measured_at), "dd/MM")}
                  </span>
                </li>
              ))}
            </ul>
          )}
         </Card>
       </div>

       <footer className="mt-10 pt-6 border-t flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
         <span>© {new Date().getFullYear()} LUMMA 2.0 · Inteligência integrativa</span>
         <Link to="/app/politicas" className="hover:text-foreground underline-offset-4 hover:underline">
           Políticas e Termos de Uso
         </Link>
       </footer>
     </div>
   );
 }

 function KpiCard({
  icon,
  label,
  value,
  hint,
  tone,
  loading,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  hint?: string;
  tone: "sage" | "brand" | "danger" | "neutral";
  loading?: boolean;
}) {
  const toneClass = {
    sage: "bg-emerald-50 text-emerald-700",
    brand: "bg-gradient-to-br from-[#e8a04c]/15 to-[#e89bcf]/15 text-[#b6743a]",
    danger: "bg-rose-50 text-rose-700",
    neutral: "bg-slate-100 text-slate-700",
  }[tone];
  return (
    <Card className="p-5 shadow-md">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          {loading ? (
            <Skeleton className="h-9 w-20 mt-2" />
          ) : (
            <p className="text-3xl font-semibold mt-1">{value}</p>
          )}
          {hint && <p className="text-xs text-muted-foreground mt-1 capitalize">{hint}</p>}
        </div>
        <div className={cn("rounded-xl p-2.5", toneClass)}>{icon}</div>
      </div>
    </Card>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="h-40 flex items-center justify-center text-center text-xs text-muted-foreground px-6">
      {text}
    </div>
  );
}
