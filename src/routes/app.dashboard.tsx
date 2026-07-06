import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
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
  Pin,
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  category: string | null;
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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [range, setRange] = useState<RangeKey>("month");
  const [patients, setPatients] = useState<PatientLite[]>([]);
  const [results, setResults] = useState<ResultRow[]>([]);
  const [examsThisMonth, setExamsThisMonth] = useState(0);
  const [recentExams, setRecentExams] = useState<ExamLite[]>([]);
  const [recentChats, setRecentChats] = useState<ChatLite[]>([]);
  const [profileDetail, setProfileDetail] = useState<{ key: string; label: string; color: string } | null>(null);
  const [detailSearch, setDetailSearch] = useState("");
  const [detailSort, setDetailSort] = useState<"date_desc" | "date_asc">("date_desc");
  const [detailPage, setDetailPage] = useState(1);
  const DETAIL_PAGE_SIZE = 10;

  useEffect(() => {
    setDetailSearch("");
    setDetailSort("date_desc");
    setDetailPage(1);
  }, [profileDetail?.key]);

  useEffect(() => {
    if (!authLoading && role === "super_admin") {
      void navigate({ to: "/app/admin/nutritionists", replace: true }).catch((error) => {
        console.warn("[dashboard] falha ao redirecionar super admin", error);
      });
    }
  }, [authLoading, role, navigate]);

  useEffect(() => {
    if (!user || role === "super_admin") return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
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
          for (let i = 0; i < 50; i++) {
            const { data, error } = await (supabase as any)
              .from("patient_exam_results")
              .select(
                "id, patient_id, marker_name, marker_value_raw, marker_unit, classification, measured_at, category",
              )
              .eq("created_by", user.id)
              .order("measured_at", { ascending: false })
              .range(from, from + pageSize - 1);
            if (error) throw error;
            if (!data) break;
            all.push(...data);
            if (data.length < pageSize) break;
            from += pageSize;
          }
          return all;
        };

        const [
          { data: pts, error: ptsErr },
          res,
          { count: examCount, error: examCountErr },
          { data: exs, error: exsErr },
          { data: chs, error: chsErr },
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
            .select("id, patient_id, title, updated_at, pinned_at")
            .eq("created_by", user.id)
            .order("pinned_at", { ascending: false, nullsFirst: false })
            .order("updated_at", { ascending: false })
            .limit(5),
        ]);

        const firstErr = ptsErr || examCountErr || exsErr || chsErr;
        if (firstErr) throw firstErr;

        if (cancelled) return;
        setPatients((pts as PatientLite[]) ?? []);
        setResults((res as ResultRow[]) ?? []);
        setExamsThisMonth(examCount ?? 0);
        setRecentExams((exs as ExamLite[]) ?? []);
        setRecentChats((chs as ChatLite[]) ?? []);
      } catch (err: any) {
        if (cancelled) return;
        console.error("[dashboard] erro ao carregar dados", err);
        setLoadError(err?.message ?? "Não foi possível carregar os dados do painel.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, role, range]);

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

  // Pacientes distintos em atenção/crítico (KPI)
  const patientsInAttentionCount = useMemo(() => {
    const set = new Set<string>();
    for (const r of filteredResults) {
      const b = classify(r.classification);
      if (b === "critico" || b === "atencao") set.add(r.patient_id);
    }
    return set.size;
  }, [filteredResults]);

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

  // Perfil de Exames Avaliados: distribuição por categoria clínica (dados reais do usuário)
  const examProfile = useMemo(() => {
    const PALETTE = [
      "#e8a04c", "#e89bcf", "#7ba6c4", "#8b5cf6",
      "#10b981", "#f59e0b", "#ef4444", "#6366f1",
      "#14b8a6", "#cbd5e1",
    ];
    const LABELS: Record<string, string> = {
      hemograma: "Hemograma",
      hemograma_anemias: "Hemograma / Anemias",
      perfil_lipidico: "Perfil Lipídico",
      perfil_hormonal: "Perfil Hormonal",
      perfil_tireoidiano: "Perfil Tireoidiano",
      perfil_glicidico: "Perfil Glicídico",
      funcao_renal: "Função Renal",
      funcao_hepatica: "Função Hepática",
      vitaminas_minerais: "Vitaminas e Minerais",
      inflamatorio: "Inflamatório",
      outros: "Outros",
    };
    const counts = new Map<string, number>();
    for (const r of filteredResults) {
      const key = (r.category ?? "outros").toString().trim().toLowerCase() || "outros";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
    const top = sorted.slice(0, 9);
    const restTotal = sorted.slice(9).reduce((s, [, v]) => s + v, 0);
    const data = top.map(([k, v], i) => ({
      key: k,
      name: LABELS[k] ?? k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      value: v,
      color: PALETTE[i % PALETTE.length],
      keys: [k],
    }));
    if (restTotal > 0) {
      data.push({
        key: "__rest__",
        name: "Outros",
        value: restTotal,
        color: "#cbd5e1",
        keys: sorted.slice(9).map(([k]) => k),
      });
    }
    return data;
  }, [filteredResults]);

  // Resultados que compõem a categoria selecionada no card de Perfil de Exames
  const profileDetailRows = useMemo(() => {
    if (!profileDetail) return [];
    const entry = examProfile.find((d) => d.key === profileDetail.key);
    const keys = new Set(entry?.keys ?? [profileDetail.key]);
    return filteredResults.filter((r) => {
      const k = (r.category ?? "outros").toString().trim().toLowerCase() || "outros";
      return keys.has(k);
    });
  }, [profileDetail, examProfile, filteredResults]);

  const profileDetailFilteredSorted = useMemo(() => {
    const q = detailSearch.trim().toLowerCase();
    const rows = q
      ? profileDetailRows.filter((r) =>
          (r.marker_name ?? "").toLowerCase().includes(q) ||
          (patientMap.get(r.patient_id) ?? "").toLowerCase().includes(q)
        )
      : profileDetailRows;
    const sorted = [...rows].sort((a, b) => {
      const ta = a.measured_at ? new Date(a.measured_at).getTime() : 0;
      const tb = b.measured_at ? new Date(b.measured_at).getTime() : 0;
      return detailSort === "date_asc" ? ta - tb : tb - ta;
    });
    return sorted;
  }, [profileDetailRows, detailSearch, detailSort, patientMap]);

  const detailTotalPages = Math.max(1, Math.ceil(profileDetailFilteredSorted.length / DETAIL_PAGE_SIZE));
  const detailPageSafe = Math.min(detailPage, detailTotalPages);
  const profileDetailPageRows = useMemo(
    () => profileDetailFilteredSorted.slice((detailPageSafe - 1) * DETAIL_PAGE_SIZE, detailPageSafe * DETAIL_PAGE_SIZE),
    [profileDetailFilteredSorted, detailPageSafe]
  );

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

  if (role === "super_admin") return null;

  return (
    <div className="space-y-6 sm:space-y-8 max-w-[1400px] mx-auto px-3 sm:px-4 lg:px-6 w-full overflow-x-hidden">
      
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
          <div className="inline-flex gap-2 flex-wrap">
            {RANGE_OPTIONS.map((opt) => {
              const active = range === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setRange(opt.key)}
                  className={cn(
                    "px-3 py-1.5 text-xs font-medium rounded-full border transition-all min-h-[32px]",
                    active
                      ? ""
                      : "border-border bg-transparent text-muted-foreground hover:text-foreground",
                  )}
                  style={
                    active
                      ? {
                          backgroundColor: "oklch(0.94 0.04 285)",
                          borderColor: "oklch(0.42 0.18 285)",
                          color: "oklch(0.42 0.18 285)",
                        }
                      : undefined
                  }
                >
                  {opt.label}
                </button>
              );
            })}
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
          <QuickAnalysisDialog 
            onCreated={() => window.location.reload()} 
            moduleContext="exames_de_sangue"
          />
        </div>
      </div>

      {/* KPIs - 4 cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {[
          { label: "Vidas Impactadas", value: stats.totalPatients },
          { label: `Exames Avaliados · ${RANGE_OPTIONS.find((o) => o.key === range)?.label ?? ""}`, value: stats.examsThisMonth },
          { label: "Pacientes em Atenção", value: patientsInAttentionCount },
          { label: "Conversas Ativas", value: recentChats.length },
        ].map((k) => (
          <Card key={k.label} className="p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{k.label}</p>
            {loading ? (
              <Skeleton className="h-9 w-20 mt-2" />
            ) : (
              <p className="font-mono font-semibold text-3xl mt-2 text-foreground">{k.value}</p>
            )}
          </Card>
        ))}
      </div>

      {/* L1: Atenção Prioritária (full width — Saúde da Base removida — item 10 auditoria) */}
      <div className="grid grid-cols-1 gap-5">

        <Card className="p-6">

          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold flex items-center gap-2">
                Atenção Prioritária
                <span className="text-xs font-normal text-muted-foreground">
                  ({attentionList.length} paciente{attentionList.length !== 1 ? "s" : ""})
                </span>
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Pacientes com marcadores em alerta ou crítico.
              </p>
            </div>
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
            <ul>
              {attentionList.map((p) => {
                const b = p.top.bucket;
                const totalAlerts = p.critical + p.attention;
                const severityBadge =
                  b === "critico"
                    ? "bg-rose-50 text-rose-700 border border-rose-200"
                    : "bg-amber-50 text-amber-700 border border-amber-200";
                return (
                  <li key={p.patient_id} className="py-3 border-b border-border/60 last:border-b-0 flex items-center gap-2 sm:gap-3 flex-wrap sm:flex-nowrap">
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
                            "rounded-full px-2 py-0.5 font-mono text-sm font-medium",
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
                        search={{ module: "exames_de_sangue" }}
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

        <Card className="p-6 lg:col-span-1">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-semibold">Saúde da Base</h2>
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
                  <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" align="center" verticalAlign="bottom" />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      {/* L2: Top 5 Deficiências (2) + Perfil de Exames (1) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card className="p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-semibold">Top 5 Deficiências</h2>
            <Sparkles className="h-4 w-4 text-[#e8a04c]" {...ICON_PROPS} />
          </div>
          <p className="text-xs text-muted-foreground mb-4">
            Marcadores classificados como baixos / deficientes na sua base.
          </p>
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
                  <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11 }} stroke="#475569" />
                  <Tooltip formatter={(v: number) => [`${v} ocorrências`, "Total"]} />
                  <Bar dataKey="count" fill="url(#defBar)" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card className="p-6 lg:col-span-1">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-semibold">Perfil de Exames Avaliados</h2>
            <PieChartIcon className="h-4 w-4 text-[#e89bcf]" {...ICON_PROPS} />
          </div>
          <p className="text-xs text-muted-foreground mb-4">Distribuição por tipo de análise.</p>
          {loading ? (
            <Skeleton className="h-56 w-full" />
          ) : loadError ? (
            <div className="h-56 flex flex-col items-center justify-center text-center gap-2 px-4">
              <AlertTriangle className="h-5 w-5 text-amber-500" {...ICON_PROPS} />
              <p className="text-xs text-muted-foreground">
                Não foi possível carregar os exames. {loadError}
              </p>
              <Button size="sm" variant="outline" onClick={() => setRange((r) => r)}>
                Tentar novamente
              </Button>
            </div>
          ) : examProfile.length === 0 ? (
            <EmptyState text="Nenhum exame avaliado no período selecionado." />
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={examProfile}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                    onClick={(d: any) =>
                      d?.payload &&
                      setProfileDetail({
                        key: d.payload.key,
                        label: d.payload.name,
                        color: d.payload.color,
                      })
                    }
                    style={{ cursor: "pointer" }}
                  >
                    {examProfile.map((d, i) => (
                      <Cell key={i} fill={d.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number, n: string) => [`${v} marcadores`, n]} />
                  <Legend
                    wrapperStyle={{ fontSize: 10, cursor: "pointer" }}
                    iconType="circle"
                    align="center"
                    verticalAlign="bottom"
                    onClick={(e: any) => {
                      const entry = examProfile.find((d) => d.name === e?.value);
                      if (entry) setProfileDetail({ key: entry.key, label: entry.name, color: entry.color });
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      {/* L3: Últimas Análises + Tendência de Exames */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card className="p-6">
          <h2 className="text-sm font-semibold mb-1">Últimas Análises</h2>
          <p className="text-xs text-muted-foreground mb-4">Agrupado por paciente.</p>
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
              {Array.from(
                filteredResults.reduce((acc, r) => {
                  if (!acc.has(r.patient_id)) {
                    acc.set(r.patient_id, {
                      patient_id: r.patient_id,
                      patientName: patientMap.get(r.patient_id) ?? "—",
                      lastAt: r.measured_at,
                      count: 1,
                    });
                  } else {
                    const existing = acc.get(r.patient_id)!;
                    existing.count++;
                    if (r.measured_at > existing.lastAt) existing.lastAt = r.measured_at;
                  }
                  return acc;
                }, new Map<string, { patient_id: string; patientName: string; lastAt: string; count: number }>()).values()
              )
                .sort((a, b) => b.lastAt.localeCompare(a.lastAt))
                .slice(0, 6)
                .map((p) => (
                  <li key={p.patient_id} className="flex items-center justify-between gap-2">
                    <Link to="/app/evolution/$patientId" params={{ patientId: p.patient_id }} className="truncate hover:underline">
                      <span className="font-medium">{p.patientName}</span>
                      <span className="text-muted-foreground"> · {p.count} marcador{p.count > 1 ? 'es' : ''}</span>
                    </Link>
                    <span className="text-muted-foreground shrink-0">{format(new Date(p.lastAt), "dd/MM")}</span>
                  </li>
                ))}
            </ul>
          )}
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-emerald-600" {...ICON_PROPS} />
              Tendência de Exames
            </h2>
            <span className="text-xs text-muted-foreground">Últimas 8 semanas</span>
          </div>
          <p className="text-xs text-muted-foreground mb-4">Ritmo de trabalho ao longo do tempo.</p>
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
                  <Area type="monotone" dataKey="count" stroke="#e8a04c" strokeWidth={2} fill="url(#trendArea)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      {/* L4: Marcadores Mais Analisados + Últimas Conversas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card className="p-6">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-semibold">Marcadores Mais Analisados</h2>
            <span className="text-xs text-muted-foreground">{RANGE_OPTIONS.find((o) => o.key === range)?.label}</span>
          </div>
          <p className="text-xs text-muted-foreground mb-4">Padrão clínico predominante na sua base.</p>
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

        <Card className="p-6">
          <h2 className="text-sm font-semibold mb-1 flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-[#e8a04c]" {...ICON_PROPS} />
            Últimas Conversas
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
              {lastChats.map((c: any) => (
                <li key={c.id}>
                  <Link
                    to="/app/chat/$patientId"
                    params={{ patientId: c.patient_id }}
                    className="flex items-center justify-between gap-2 rounded-lg px-2 py-2 hover:bg-muted/60 transition-colors group"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <div className="text-xs font-medium truncate">{c.patientName}</div>
                        {c.pinned_at && (
                          <Pin className="h-2.5 w-2.5 text-[#e8a04c] fill-[#e8a04c]" />
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground truncate">
                        {c.title ?? "Conversa com a Lumma"}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] text-muted-foreground">
                        {format(new Date(c.updated_at), "dd/MM")}
                      </span>
                      <button
                        onClick={async (e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const isPinned = !!c.pinned_at;
                          const { error } = await supabase
                            .from('patient_chats')
                            .update({ pinned_at: isPinned ? null : new Date().toISOString() })
                            .eq('id', c.id);
                          if (!error) {
                            window.location.reload();
                          }
                        }}
                        className={cn(
                          "p-1 hover:bg-muted rounded transition-opacity",
                          c.pinned_at ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                        )}
                      >
                        <Pin className={cn("h-3 w-3", c.pinned_at ? "text-[#e8a04c] fill-[#e8a04c]" : "text-muted-foreground")} />
                      </button>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* L5: Perfil da Base + Aniversariantes + Reengajar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card className="p-6">
          <h2 className="text-sm font-semibold mb-1 flex items-center gap-2">
            <PieChartIcon className="h-4 w-4 text-[#7ba88b]" {...ICON_PROPS} />
            Perfil da Base
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
                    <Pie data={baseProfile.gender} dataKey="value" nameKey="name" innerRadius={28} outerRadius={48} paddingAngle={2}>
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
                  const pct = baseProfile.totalWithBirth ? Math.round((a.count / baseProfile.totalWithBirth) * 100) : 0;
                  return (
                    <li key={a.name} className="flex items-center gap-2">
                      <span className="w-12 text-muted-foreground">{a.name}</span>
                      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-[#e8a04c] to-[#e89bcf]" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="w-8 text-right tabular-nums text-muted-foreground">{a.count}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </Card>

        <Card className="p-6">
          <h2 className="text-sm font-semibold mb-1 flex items-center gap-2">
            <Cake className="h-4 w-4 text-[#e89bcf]" {...ICON_PROPS} />
            Aniversariantes da Semana
          </h2>
          <p className="text-xs text-muted-foreground mb-4">Um carinho de parabéns vai longe.</p>
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
                  <Link to="/app/evolution/$patientId" params={{ patientId: b.id }} className="truncate hover:underline min-w-0">
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
                    {b.inDays === 0 ? "Hoje!" : b.inDays === 1 ? "Amanhã" : format(b.next, "dd/MM")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <Clock className="h-4 w-4 text-[#e8a04c]" {...ICON_PROPS} />
                Reengajar Pacientes
              </h2>
              <p className="text-xs text-muted-foreground">Sem exame há mais de 60 dias.</p>
            </div>
            <Badge variant="outline" className="text-[10px]">{followUpList.length}</Badge>
          </div>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : followUpList.length === 0 ? (
            <EmptyState text="Todas as pacientes em dia." />
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
                  <Link to="/app/chat/$patientId" params={{ patientId: p.id }} search={{ module: "exames_de_sangue" }}>
                    <Button size="sm" variant="ghost" className="rounded-full gap-1">
                      Conversar <ArrowRight className="h-3.5 w-3.5" {...ICON_PROPS} />
                    </Button>
                  </Link>
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

       <Dialog open={!!profileDetail} onOpenChange={(o) => !o && setProfileDetail(null)}>
         <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
           <DialogHeader>
             <DialogTitle className="flex items-center gap-2">
               <span
                 className="inline-block h-3 w-3 rounded-full"
                 style={{ background: profileDetail?.color ?? "#cbd5e1" }}
               />
               {profileDetail?.label ?? "Categoria"}
             </DialogTitle>
             <DialogDescription>
               {profileDetailFilteredSorted.length} de {profileDetailRows.length} marcador{profileDetailRows.length === 1 ? "" : "es"} no período.
             </DialogDescription>
           </DialogHeader>
           <div className="flex flex-col sm:flex-row gap-2 pb-2">
             <Input
               placeholder="Buscar por marcador ou paciente…"
               value={detailSearch}
               onChange={(e) => { setDetailSearch(e.target.value); setDetailPage(1); }}
               className="h-9"
             />
             <Select value={detailSort} onValueChange={(v) => setDetailSort(v as "date_desc" | "date_asc")}>
               <SelectTrigger className="h-9 sm:w-48"><SelectValue /></SelectTrigger>
               <SelectContent>
                 <SelectItem value="date_desc">Data ↓ (mais recente)</SelectItem>
                 <SelectItem value="date_asc">Data ↑ (mais antiga)</SelectItem>
               </SelectContent>
             </Select>
           </div>
           <div className="flex-1 overflow-auto border rounded-lg">
             {profileDetailPageRows.length === 0 ? (
               <div className="p-6 text-center text-sm text-muted-foreground">
                 Nenhum resultado encontrado.
               </div>
             ) : (
               <table className="w-full text-xs">
                 <thead className="bg-muted/50 sticky top-0">
                   <tr className="text-left">
                     <th className="px-3 py-2 font-medium">Paciente</th>
                     <th className="px-3 py-2 font-medium">Marcador</th>
                     <th className="px-3 py-2 font-medium">Valor</th>
                     <th className="px-3 py-2 font-medium">Classificação</th>
                     <th className="px-3 py-2 font-medium">Data</th>
                   </tr>
                 </thead>
                 <tbody>
                   {profileDetailPageRows.map((r) => (
                     <tr key={r.id} className="border-t hover:bg-muted/30">
                       <td className="px-3 py-2">
                         <Link
                           to="/app/evolution/$patientId"
                           params={{ patientId: r.patient_id }}
                           className="text-primary hover:underline"
                           onClick={() => setProfileDetail(null)}
                         >
                           {patientMap.get(r.patient_id) ?? "—"}
                         </Link>
                       </td>
                       <td className="px-3 py-2">{r.marker_name}</td>
                       <td className="px-3 py-2 whitespace-nowrap">
                         {r.marker_value_raw ?? "—"}
                         {r.marker_unit ? ` ${r.marker_unit}` : ""}
                       </td>
                       <td className="px-3 py-2">{r.classification ?? "—"}</td>
                       <td className="px-3 py-2 whitespace-nowrap">
                         {r.measured_at ? format(new Date(r.measured_at), "dd/MM/yyyy") : "—"}
                       </td>
                     </tr>
                   ))}
                 </tbody>
               </table>
             )}
           </div>
           <div className="flex items-center justify-between pt-2 text-xs text-muted-foreground">
             <span>Página {detailPageSafe} de {detailTotalPages}</span>
             <div className="flex gap-2">
               <Button size="sm" variant="outline" disabled={detailPageSafe <= 1} onClick={() => setDetailPage((p) => Math.max(1, p - 1))}>Anterior</Button>
               <Button size="sm" variant="outline" disabled={detailPageSafe >= detailTotalPages} onClick={() => setDetailPage((p) => Math.min(detailTotalPages, p + 1))}>Próxima</Button>
             </div>
           </div>
         </DialogContent>
       </Dialog>
     </div>
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
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const acknowledge = () => {
    setShowModal(false);
  };

  if (!mounted || !showModal || typeof document === "undefined") return null;

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
                (Etapa 3)
              </span>
            </h2>
          </div>

          <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
            <p>
              Você está acessando o ambiente de homologação da{" "}
              <strong className="text-foreground">LUMMA</strong>, já operando em nossa{" "}
              <strong className="text-foreground">VPS de alta performance</strong>. Nosso
              foco agora é garantir a extração correta dos dados e refinar o layout antes
              da liberação geral.
            </p>
            <p>Antes de seguir, é importante saber:</p>
            <ul className="space-y-3 pl-1">
              <li className="flex gap-3">
                <span className="mt-2 h-1.5 w-1.5 rounded-full bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] shrink-0" />
                <span>
                  <strong className="text-foreground">Extração de Dados em primeiro lugar:</strong>{" "}
                  nossa prioridade nesta fase é validar a precisão da leitura de exames
                  (PDFs e imagens) e a fidelidade dos dados interpretados. Teste laudos
                  variados, especialmente os mais complexos.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="mt-2 h-1.5 w-1.5 rounded-full bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] shrink-0" />
                <span>
                  <strong className="text-foreground">Ajustes de Layout:</strong> em
                  paralelo, estamos refinando telas, espaçamentos e componentes. Pequenas
                  inconsistências visuais podem aparecer e serão corrigidas antes do
                  lançamento oficial.
                </span>
              </li>
            </ul>
            <p className="italic">
              Seu feedback nesta etapa é essencial para calibrarmos a curadoria do sistema
              e entregarmos uma experiência impecável.
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
