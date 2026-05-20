import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
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
  MessageCircle,
  TrendingUp,
  PieChart as PieChartIcon,
  Lightbulb,
} from "lucide-react";

// Ícones com peso visual leve e tamanho uniforme em toda a página
const ICON_PROPS = { strokeWidth: 1.6 } as const;
import { differenceInCalendarDays, differenceInYears, format, startOfDay, startOfMonth, startOfWeek, subDays } from "date-fns";
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
  Area,
  AreaChart,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { QuickAnalysisDialog } from "@/components/QuickAnalysisDialog";
import { SupportWidget } from "@/components/SupportWidget";
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
  gender: string | null;
}

interface ExamLite {
  id: string;
  created_at: string;
}

interface ChatLite {
  id: string;
  patient_id: string;
  title: string | null;
  updated_at: string;
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
  const [recentExams, setRecentExams] = useState<ExamLite[]>([]);
  const [recentChats, setRecentChats] = useState<ChatLite[]>([]);

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

      const sinceSparkline = subDays(new Date(), 7 * 8).toISOString();

      // Paginação para buscar TODOS os resultados (Supabase limita 1000 por requisição)
      const fetchAllResults = async () => {
        const pageSize = 1000;
        let from = 0;
        const all: any[] = [];
        // hard cap de segurança (50k linhas)
        for (let i = 0; i < 50; i++) {
          const { data, error } = await (supabase as any)
            .from("patient_exam_results")
            .select(
              "id, patient_id, marker_name, marker_value_raw, marker_unit, classification, measured_at",
            )
            .eq("created_by", user.id)
            .order("measured_at", { ascending: false })
            .range(from, from + pageSize - 1);
          if (error || !data) break;
          all.push(...data);
          if (data.length < pageSize) break;
          from += pageSize;
        }
        return all;
      };

      const [
        { data: pts },
        res,
        { count: examCount },
        { data: exs },
        { data: chs },
      ] = await Promise.all([
        (supabase as any)
          .from("patients")
          .select("id, name, birth_date, created_at, gender")
          .eq("created_by", user.id),
        fetchAllResults(),
        examsQuery,
        (supabase as any)
          .from("patient_exams")
          .select("id, created_at")
          .eq("uploaded_by", user.id)
          .gte("created_at", sinceSparkline)
          .order("created_at", { ascending: true })
          .limit(2000),
        (supabase as any)
          .from("patient_chats")
          .select("id, patient_id, title, updated_at")
          .eq("created_by", user.id)
          .order("updated_at", { ascending: false })
          .limit(5),
      ]);

          .from("patient_chats")
          .select("id, patient_id, title, updated_at")
          .eq("created_by", user.id)
          .order("updated_at", { ascending: false })
          .limit(5),
      ]);


      if (cancelled) return;
      setPatients((pts as PatientLite[]) ?? []);
      setResults((res as ResultRow[]) ?? []);
      setExamsThisMonth(examCount ?? 0);
      setRecentExams((exs as ExamLite[]) ?? []);
      setRecentChats((chs as ChatLite[]) ?? []);
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

  // Pacientes sem exame há +60 dias (usa último measured_at; cai para created_at)
  const followUpList = useMemo(() => {
    const lastByPatient = new Map<string, string>();
    for (const r of results) {
      const cur = lastByPatient.get(r.patient_id);
      if (!cur || r.measured_at > cur) lastByPatient.set(r.patient_id, r.measured_at);
    }
    const now = new Date();
    const rows = patients.map((p) => {
      const ref = lastByPatient.get(p.id) ?? p.created_at;
      const days = differenceInCalendarDays(now, new Date(ref));
      return { id: p.id, name: p.name, lastAt: ref, days, hasExam: lastByPatient.has(p.id) };
    });
    return rows
      .filter((r) => r.days >= 60)
      .sort((a, b) => b.days - a.days)
      .slice(0, 6);
  }, [patients, results]);

  // Aniversariantes dos próximos 7 dias
  const birthdaysWeek = useMemo(() => {
    const today = startOfDay(new Date());
    const yearNow = today.getFullYear();
    const rows = patients
      .filter((p) => !!p.birth_date)
      .map((p) => {
        const bd = new Date(p.birth_date as string);
        // Mantém em UTC para não derivar de fuso
        const m = bd.getUTCMonth();
        const d = bd.getUTCDate();
        let next = new Date(yearNow, m, d);
        if (differenceInCalendarDays(next, today) < 0) {
          next = new Date(yearNow + 1, m, d);
        }
        const inDays = differenceInCalendarDays(next, today);
        const turning = next.getFullYear() - bd.getUTCFullYear();
        return { id: p.id, name: p.name, next, inDays, turning };
      })
      .filter((r) => r.inDays >= 0 && r.inDays <= 7)
      .sort((a, b) => a.inDays - b.inDays);
    return rows;
  }, [patients]);

  // Tendência: volume de exames por semana nas últimas 8 semanas
  const examsTrend = useMemo(() => {
    const weeks: { label: string; count: number; start: Date }[] = [];
    const today = startOfDay(new Date());
    for (let i = 7; i >= 0; i--) {
      const start = startOfWeek(subDays(today, i * 7), { weekStartsOn: 1 });
      weeks.push({ label: format(start, "dd/MM"), count: 0, start });
    }
    for (const e of recentExams) {
      const t = new Date(e.created_at).getTime();
      for (let i = weeks.length - 1; i >= 0; i--) {
        if (t >= weeks[i].start.getTime()) {
          weeks[i].count++;
          break;
        }
      }
    }
    return weeks;
  }, [recentExams]);

  // Top marcadores analisados (todos, não só deficiências)
  const topMarkers = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of filteredResults) {
      counts.set(r.marker_name, (counts.get(r.marker_name) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }, [filteredResults]);

  // Perfil da base: distribuição por gênero e faixa etária
  const baseProfile = useMemo(() => {
    const gender = { feminino: 0, masculino: 0, outro: 0 };
    const ages = { "0-17": 0, "18-29": 0, "30-44": 0, "45-59": 0, "60+": 0 };
    const now = new Date();
    for (const p of patients) {
      const g = (p.gender ?? "").toLowerCase();
      if (g.startsWith("f")) gender.feminino++;
      else if (g.startsWith("m")) gender.masculino++;
      else gender.outro++;
      if (p.birth_date) {
        const a = differenceInYears(now, new Date(p.birth_date));
        if (a < 18) ages["0-17"]++;
        else if (a < 30) ages["18-29"]++;
        else if (a < 45) ages["30-44"]++;
        else if (a < 60) ages["45-59"]++;
        else ages["60+"]++;
      }
    }
    return {
      gender: [
        { name: "Feminino", value: gender.feminino, color: "#e89bcf" },
        { name: "Masculino", value: gender.masculino, color: "#7ba6c4" },
        { name: "Outro / —", value: gender.outro, color: "#cbd5e1" },
      ].filter((g) => g.value > 0),
      ages: Object.entries(ages).map(([k, v]) => ({ name: k, count: v })),
      totalWithBirth: patients.filter((p) => !!p.birth_date).length,
    };
  }, [patients]);

  // Últimas conversas com a Lumma
  const lastChats = useMemo(() => {
    return recentChats.slice(0, 4).map((c) => ({
      ...c,
      patientName: patientMap.get(c.patient_id) ?? "Paciente",
    }));
  }, [recentChats, patientMap]);

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
    <div className="space-y-6 sm:space-y-8 max-w-[1400px] mx-auto px-3 sm:px-4 lg:px-6 w-full overflow-x-hidden">
      <TestEnvironmentNotice />
      <SupportWidget />
      {/* Header */}
      <div className="flex flex-col md:flex-row md:flex-wrap md:items-center md:justify-between gap-4 md:gap-5">
        <div className="min-w-0">
          <h1
            className="text-2xl sm:text-3xl bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] bg-clip-text text-transparent break-words"
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
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <div className="inline-flex rounded-full bg-muted/60 p-1 flex-wrap">
            {RANGE_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setRange(opt.key)}
                className={cn(
                  "px-3 sm:px-4 py-1.5 text-xs font-medium rounded-full transition-all min-h-[36px]",
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
              className="rounded-full bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] text-white shadow hover:opacity-90 min-h-[44px]"
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

      {/* Lumma Insights — inteligência consolidada da base */}
      <Card className="relative overflow-hidden border border-[#f1d9b8] bg-gradient-to-br from-[#fffaf2] via-white to-[#fdf3f8] p-4 sm:p-5 shadow-sm">
        <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-[#e8a04c] to-[#e89bcf]" />
        <div className="flex items-start gap-4 pl-2">
          <div className="shrink-0 mt-0.5 h-9 w-9 rounded-full bg-white shadow-sm border border-[#f1d9b8] flex items-center justify-center">
            <Lightbulb className="h-4 w-4 text-[#e8a04c]" {...ICON_PROPS} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm font-semibold tracking-tight">
                Insight Consolidado da Base
              </h2>
              <Badge className="bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] text-white border-0 text-[10px] h-4 px-2 hover:opacity-90">
                LUMMA Insights
              </Badge>
            </div>
            <p className="text-[13px] text-foreground/80 mt-1.5 leading-relaxed max-w-3xl">
              A análise automatizada desta semana identificou uma tendência de{" "}
              <strong className="text-[#b6743a]">12% de aumento</strong> em marcadores de
              estresse oxidativo na sua base de pacientes ativos. O perfil predominante
              atual exige atenção preventiva para deficiência de{" "}
              <strong className="text-foreground">Vitamina B12</strong> e{" "}
              <strong className="text-foreground">Ferritina</strong>.
            </p>
          </div>
        </div>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
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
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-5">
        {/* Distribution */}
        <Card className="p-4 sm:p-6 lg:col-span-1">
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
        <Card className="p-4 sm:p-6 lg:col-span-2">
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
                const severityBadge =
                  b === "critico"
                    ? "bg-rose-50 text-rose-700 border border-rose-200"
                    : "bg-amber-50 text-amber-700 border border-amber-200";
                return (
                  <li key={p.patient_id} className="py-3 flex items-center gap-2 sm:gap-3 flex-wrap sm:flex-nowrap">
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
                      <div className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1.5 flex-wrap">
                        <span className="font-medium text-foreground/80">
                          {p.top.marker_name}
                        </span>
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[10px] font-medium",
                            severityBadge,
                          )}
                        >
                          {p.top.marker_value_raw}
                          {p.top.marker_unit ? ` ${p.top.marker_unit}` : ""} ·{" "}
                          {p.top.classification}
                        </span>
                        <span className="text-muted-foreground/80">
                          · {format(new Date(p.lastAt), "dd/MM/yyyy")}
                          {totalAlerts > 1 ? ` · ${totalAlerts} marcadores` : ""}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 ml-auto">
                      <Link
                        to="/app/evolution/$patientId"
                        params={{ patientId: p.patient_id }}
                      >
                        <Button
                          size="sm"
                          variant="ghost"
                          className="rounded-full gap-1 text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50"
                          title="Ver evolução clínica"
                        >
                          <TrendingUp className="h-3.5 w-3.5" {...ICON_PROPS} />
                          <span className="hidden sm:inline">Ver Evolução</span>
                        </Button>
                      </Link>
                      <Link
                        to="/app/chat/$patientId"
                        params={{ patientId: p.patient_id }}
                      >
                        <Button size="sm" variant="ghost" className="rounded-full gap-1">
                          Abrir <ArrowRight className="h-3.5 w-3.5" {...ICON_PROPS} />
                        </Button>
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* Top deficiencies */}
        <Card className="p-4 sm:p-6 lg:col-span-2">
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
                    width={100}
                    tick={{ fontSize: 11 }}
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
        <Card className="p-4 sm:p-6 lg:col-span-1">
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

        {/* Follow-up: pacientes sem exame há +60 dias */}
        <Card className="p-4 sm:p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <Clock className="h-4 w-4 text-[#e8a04c]" {...ICON_PROPS} />
                Reengajar pacientes
              </h2>
              <p className="text-xs text-muted-foreground">
                Sem exame há mais de 60 dias — bom momento para um follow-up.
              </p>
            </div>
            <Badge variant="outline" className="text-[10px]">
              {followUpList.length}
            </Badge>
          </div>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : followUpList.length === 0 ? (
            <EmptyState text="Todas as pacientes em dia. Excelente acompanhamento." />
          ) : (
            <ul className="divide-y">
              {followUpList.map((p) => (
                <li key={p.id} className="py-3 flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{p.name}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      {p.hasExam
                        ? `Último exame em ${format(new Date(p.lastAt), "dd/MM/yyyy")}`
                        : `Cadastrada em ${format(new Date(p.lastAt), "dd/MM/yyyy")} · sem exames`}
                      {" · "}
                      <span className="font-medium text-[#b6743a]">{p.days} dias</span>
                    </div>
                  </div>
                  <Link to="/app/chat/$patientId" params={{ patientId: p.id }}>
                    <Button size="sm" variant="ghost" className="rounded-full gap-1">
                      Conversar <ArrowRight className="h-3.5 w-3.5" {...ICON_PROPS} />
                    </Button>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Aniversariantes da semana */}
        <Card className="p-4 sm:p-6 lg:col-span-1">
          <h2 className="text-sm font-semibold mb-1 flex items-center gap-2">
            <Cake className="h-4 w-4 text-[#e89bcf]" {...ICON_PROPS} />
            Aniversariantes da semana
          </h2>
          <p className="text-xs text-muted-foreground mb-4">
            Um carinho de parabéns vai longe.
          </p>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : birthdaysWeek.length === 0 ? (
            <EmptyState text="Nenhum aniversário nos próximos 7 dias." />
          ) : (
            <ul className="space-y-2.5">
              {birthdaysWeek.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-2 text-xs">
                  <Link
                    to="/app/evolution/$patientId"
                    params={{ patientId: b.id }}
                    className="truncate hover:underline min-w-0"
                  >
                    <span className="font-medium">{b.name}</span>
                    <span className="text-muted-foreground"> · {b.turning} anos</span>
                  </Link>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
                      b.inDays === 0
                        ? "bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] text-white"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {b.inDays === 0
                      ? "Hoje!"
                      : b.inDays === 1
                        ? "Amanhã"
                        : format(b.next, "dd/MM")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Tendência semanal de exames */}
        <Card className="p-4 sm:p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-emerald-600" {...ICON_PROPS} />
              Tendência de exames
            </h2>
            <span className="text-xs text-muted-foreground">Últimas 8 semanas</span>
          </div>
          <p className="text-xs text-muted-foreground mb-4">
            Ritmo de trabalho ao longo do tempo.
          </p>
          {loading ? (
            <Skeleton className="h-48 w-full" />
          ) : examsTrend.every((w) => w.count === 0) ? (
            <EmptyState text="Sem exames nas últimas 8 semanas." />
          ) : (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={examsTrend} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="trendArea" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#e8a04c" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#e89bcf" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                  <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" allowDecimals={false} width={28} />
                  <Tooltip formatter={(v: number) => [`${v} exames`, "Volume"]} />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="#e8a04c"
                    strokeWidth={2}
                    fill="url(#trendArea)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        {/* Última conversa com a Lumma */}
        <Card className="p-4 sm:p-6 lg:col-span-1">
          <h2 className="text-sm font-semibold mb-1 flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-[#e8a04c]" {...ICON_PROPS} />
            Últimas conversas
          </h2>
          <p className="text-xs text-muted-foreground mb-4">Retome de onde parou.</p>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : lastChats.length === 0 ? (
            <EmptyState text="Nenhuma conversa registrada ainda." />
          ) : (
            <ul className="space-y-2">
              {lastChats.map((c) => (
                <li key={c.id}>
                  <Link
                    to="/app/chat/$patientId"
                    params={{ patientId: c.patient_id }}
                    className="flex items-center justify-between gap-2 rounded-lg px-2 py-2 hover:bg-muted/60 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-medium truncate">{c.patientName}</div>
                      <div className="text-[11px] text-muted-foreground truncate">
                        {c.title ?? "Conversa com a Lumma"}
                      </div>
                    </div>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {format(new Date(c.updated_at), "dd/MM")}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Top marcadores analisados */}
        <Card className="p-4 sm:p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-semibold">Marcadores mais analisados</h2>
            <span className="text-xs text-muted-foreground">
              {RANGE_OPTIONS.find((o) => o.key === range)?.label}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mb-4">
            Padrão clínico predominante na sua base.
          </p>
          {loading ? (
            <Skeleton className="h-48 w-full" />
          ) : topMarkers.length === 0 ? (
            <EmptyState text="Sem marcadores no período." />
          ) : (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topMarkers} layout="vertical" margin={{ left: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#eef2f7" />
                  <XAxis type="number" tick={{ fontSize: 11 }} stroke="#94a3b8" allowDecimals={false} />
                  <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11 }} stroke="#475569" />
                  <Tooltip formatter={(v: number) => [`${v} análises`, "Total"]} />
                  <Bar dataKey="count" fill="#7ba88b" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        {/* Perfil da base: gênero + faixa etária */}
        <Card className="p-4 sm:p-6 lg:col-span-1">
          <h2 className="text-sm font-semibold mb-1 flex items-center gap-2">
            <PieChartIcon className="h-4 w-4 text-[#7ba88b]" {...ICON_PROPS} />
            Perfil da base
          </h2>
          <p className="text-xs text-muted-foreground mb-3">
            {patients.length} pacientes · {baseProfile.totalWithBirth} com idade
          </p>
          {loading ? (
            <Skeleton className="h-48 w-full" />
          ) : patients.length === 0 ? (
            <EmptyState text="Cadastre pacientes para ver o perfil." />
          ) : (
            <div className="space-y-3">
              <div className="h-28">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={baseProfile.gender}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={28}
                      outerRadius={48}
                      paddingAngle={2}
                    >
                      {baseProfile.gender.map((g) => (
                        <Cell key={g.name} fill={g.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 10 }} iconType="circle" />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="space-y-1 text-[11px]">
                {baseProfile.ages.map((a) => {
                  const pct = baseProfile.totalWithBirth
                    ? Math.round((a.count / baseProfile.totalWithBirth) * 100)
                    : 0;
                  return (
                    <li key={a.name} className="flex items-center gap-2">
                      <span className="w-12 text-muted-foreground">{a.name}</span>
                      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-[#e8a04c] to-[#e89bcf]"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="w-8 text-right tabular-nums text-muted-foreground">{a.count}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
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

const TEST_ENV_ACK_KEY = "lumma_test_environment_acknowledged";

function TestEnvironmentNotice() {
  const [showModal, setShowModal] = useState(true);

  const acknowledge = () => {
    setShowModal(false);
  };

  if (!showModal || typeof document === "undefined") return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="test-env-title"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-border overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="h-1.5 w-full bg-gradient-to-r from-[#e8a04c] to-[#e89bcf]" />
        <div className="p-7 space-y-5">
          <div>
            <h2
              id="test-env-title"
              className="text-2xl text-foreground leading-tight"
              style={{ fontFamily: "'Instrument Serif', serif" }}
            >
              ⚠️ Ambiente de Validação Técnica{" "}
              <span className="bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] bg-clip-text text-transparent">
                (Etapa 2)
              </span>
            </h2>
          </div>

          <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
            <p>
              Você está acessando o ambiente de homologação e testes estruturais da{" "}
              <strong className="text-foreground">LUMMA</strong>. Este espaço é dedicado
              exclusivamente à validação do nosso novo motor de processamento.
            </p>
            <p>Por favor, esteja ciente de dois pontos importantes durante seus testes:</p>
            <ul className="space-y-3 pl-1">
              <li className="flex gap-3">
                <span className="mt-2 h-1.5 w-1.5 rounded-full bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] shrink-0" />
                <span>
                  <strong className="text-foreground">Processamento de Dados:</strong> o foco
                  desta etapa é validar a estabilidade e a precisão da leitura de arquivos
                  (PDFs e imagens). Sinta-se à vontade para testar laudos complexos que
                  costumavam falhar.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="mt-2 h-1.5 w-1.5 rounded-full bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] shrink-0" />
                <span>
                  <strong className="text-foreground">Velocidade de Navegação:</strong> como
                  estamos operando em servidores de desenvolvimento para homologação, a
                  velocidade de resposta ainda não é a máxima da plataforma. A infraestrutura
                  de alta performance e tráfego ultra-rápido será ativada na Etapa 3, com a
                  migração para a sua VPS própria.
                </span>
              </li>
            </ul>
            <p className="italic">
              Sua experiência e feedback nesta fase são fundamentais para calibrarmos a
              curadoria do sistema.
            </p>
          </div>

          <Button
            onClick={acknowledge}
            className="w-full rounded-full h-11 bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] text-white shadow hover:opacity-90 text-sm font-medium"
          >
            Estou Ciente e Quero Iniciar
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
