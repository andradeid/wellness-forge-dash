import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, startOfDay, startOfMonth, startOfWeek, startOfYear, subMonths, subWeeks, subYears, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar, PieChart, Pie, Cell,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Info } from "lucide-react";

function InfoTip({ text }: { text: string }) {
  return (
    <TooltipProvider delayDuration={100}>
      <UITooltip>
        <TooltipTrigger asChild>
          <button type="button" className="inline-flex text-muted-foreground hover:text-foreground transition-colors" aria-label="Informações">
            <Info className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="left" className="max-w-xs text-xs leading-relaxed">
          {text}
        </TooltipContent>
      </UITooltip>
    </TooltipProvider>
  );
}

export const Route = createFileRoute("/app/admin/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard Admin — Lumma" }] }),
  component: AdminDashboardPage,
});

type Period = "today" | "week" | "month" | "year";
const PERIOD_LABEL: Record<Period, string> = {
  today: "Hoje", week: "Esta semana", month: "Este mês", year: "Este ano",
};
const PERIOD_SUFFIX: Record<Period, string> = {
  today: "vs ontem", week: "vs semana anterior", month: "vs mês anterior", year: "vs ano anterior",
};
const CHIP_ACTIVE = {
  backgroundColor: "oklch(0.94 0.04 285)",
  borderColor: "oklch(0.42 0.18 285)",
  color: "oklch(0.42 0.18 285)",
} as const;

/** Início do período atual e do período imediatamente anterior (mesma duração). */
function periodRange(p: Period): { since: Date; prevSince: Date } {
  const now = new Date();
  if (p === "today") return { since: startOfDay(now), prevSince: startOfDay(subDays(now, 1)) };
  if (p === "week") {
    const since = startOfWeek(now, { weekStartsOn: 1 });
    return { since, prevSince: startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 }) };
  }
  if (p === "month") {
    const since = startOfMonth(now);
    return { since, prevSince: startOfMonth(subMonths(now, 1)) };
  }
  const since = startOfYear(now);
  return { since, prevSince: startOfYear(subYears(now, 1)) };
}

function pct(curr: number, prev: number, suffix: string): { txt: string; up: boolean } {
  if (prev === 0) return { txt: curr > 0 ? "novo" : "—", up: curr >= 0 };
  const v = ((curr - prev) / prev) * 100;
  const up = v >= 0;
  return { txt: `${up ? "↑" : "↓"} ${Math.abs(v).toFixed(0)}% ${suffix}`, up };
}

const PLAN_COLORS = ["#e8a04c", "#e89bcf", "#94b8a4", "#cbd5e1", "#b6a1e0", "#f0c987", "#8ec5d6"];

const PLAN_LABELS: Record<string, string> = {
  free: "Gratuito",
  trial: "Trial",
  starter: "Starter",
  pro: "Pro",
  pro_anual: "Pro anual",
  legado_500: "Legado 500",
  legado: "Legado",
};

interface DashboardStats {
  activeNutris: number;
  activeSubs: number;
  trialSubs: number;
  periodAnalyses: number;
  prevAnalyses: number;
  periodExams: number;
  periodChats: number;
  creditsConsumed: number;
  creditsAvailable: number;
  totalNutris: number;
  inactiveCount: number;
  trialExpiring: { user_id: string; plan_type: string | null; current_period_end: string; full_name: string | null; email: string | null }[];
  inactive: { id: string; full_name: string | null; email: string | null; last: string | null }[];
  topNutris: { id: string; full_name: string | null; email: string | null; analyses: number; exams: number; chats: number; last: string | null }[];
  weekly: { label: string; v: number }[];
  growth: { label: string; v: number }[];
  planDist: { name: string; v: number }[];
  funcRank: { name: string; v: number }[];
  logs: { id: string; created_at: string; event: string; status: string; message: string | null }[];
}

function AdminDashboardPage() {
  const [period, setPeriod] = useState<Period>("month");
  const { since, prevSince } = useMemo(() => periodRange(period), [period]);

  const statsQuery = useQuery({
    queryKey: ["admin-dashboard-stats", period],
    staleTime: 60_000,
    queryFn: async (): Promise<DashboardStats> => {
      const { data, error } = await (supabase as any).rpc("admin_dashboard_stats", {
        p_since: since.toISOString(),
        p_prev_since: prevSince.toISOString(),
      });
      if (error) throw error;
      return data as DashboardStats;
    },
  });

  const m = statsQuery.data;

  const trialBg = "oklch(0.98 0.03 75)";
  const trialBorder = "oklch(0.85 0.12 75)";

  const creditsRatio = m && m.creditsAvailable > 0 ? m.creditsConsumed / m.creditsAvailable : 0;
  const analysesPct = pct(m?.periodAnalyses ?? 0, m?.prevAnalyses ?? 0, PERIOD_SUFFIX[period]);

  const barColor =
    creditsRatio > 0.95 ? "oklch(0.55 0.18 25)" :
    creditsRatio > 0.80 ? "oklch(0.7 0.15 65)" :
    "oklch(0.55 0.15 285)";

  const planDist = useMemo(
    () => (m?.planDist ?? []).map((d, i) => ({
      ...d,
      name: PLAN_LABELS[d.name] ?? d.name,
      c: PLAN_COLORS[i % PLAN_COLORS.length]!,
    })),
    [m?.planDist],
  );

  const periodLabel = PERIOD_LABEL[period].toLowerCase();

  const filters = (
    <div className="flex gap-2">
      {(Object.keys(PERIOD_LABEL) as Period[]).map((p) => {
        const active = p === period;
        return (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className="px-3 py-1.5 text-xs rounded-full border transition-colors"
            style={active ? CHIP_ACTIVE : { borderColor: "var(--border)", color: "var(--muted-foreground)", background: "transparent" }}
          >
            {PERIOD_LABEL[p]}
          </button>
        );
      })}
    </div>
  );

  if (statsQuery.isLoading || !m) {
    return (
      <div className="space-y-8 max-w-7xl">
        <div className="flex items-end justify-between flex-wrap gap-4">
          <h1 className="font-serif text-2xl font-semibold tracking-tight text-foreground">
            Visão geral do <span className="italic text-gradient-brand">negócio</span>
          </h1>
          {filters}
        </div>
        {statsQuery.isError ? (
          <p className="py-20 text-center text-sm text-destructive">Não foi possível carregar os indicadores.</p>
        ) : (
          <p className="py-20 text-center text-sm text-muted-foreground">Carregando dashboard...</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-7xl">
      {/* Header + filtros */}
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-serif text-2xl font-semibold tracking-tight text-foreground">
            Visão geral do <span className="italic text-gradient-brand">negócio</span>
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Período: {PERIOD_LABEL[period]} · desde {format(since, "dd/MM/yyyy", { locale: ptBR })}
          </p>
        </div>
        {filters}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4">
        <Kpi label="Nutricionistas Ativos" value={m.activeNutris} hint={`${periodLabel} · de ${m.totalNutris.toLocaleString("pt-BR")} cadastrados`} />
        <Kpi label="Assinaturas Ativas" value={m.activeSubs} hint="vigentes" />
        <Kpi label="Em Trial" value={m.trialSubs} hint="vigentes" />
        <Kpi
          label="Trials expirando em 7d"
          value={m.trialExpiring.length}
          hint="atenção necessária"
          style={{ background: trialBg, borderColor: trialBorder }}
        />
      </div>

      {/* Assinaturas e vencimentos (monitoramento) */}
      <SubscriptionExpiryCard />



      {/* Bloco 2 — uso */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="col-span-2 p-6 rounded-2xl">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-sm">Análises Geradas por Semana</h3>
            <span className="text-xs text-muted-foreground">últimas 8 semanas</span>
          </div>
          <div style={{ height: 220 }}>
            <ResponsiveContainer>
              <LineChart data={m.weekly}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.005 285)" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line type="monotone" dataKey="v" stroke="#e8a04c" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t">
            <Mini label={`Análises (${periodLabel})`} value={m.periodAnalyses} hint={analysesPct.txt} />
            <Mini label="Exames anexados" value={m.periodExams} />
            <Mini label="Conversas abertas" value={m.periodChats} />
          </div>
        </Card>

        <Card className="p-6 rounded-2xl">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-semibold text-sm">Créditos</h3>
              <p className="text-xs text-muted-foreground mt-1">Consumo · {PERIOD_LABEL[period]}</p>
            </div>
            <InfoTip text="Panorama de créditos do período selecionado para toda a plataforma (todos os nutricionistas somados). Serve para acompanhar o consumo agregado da operação, não o saldo de um usuário específico." />
          </div>
          <div className="mt-6">
            <div className="flex items-baseline justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-2xl">{m.creditsConsumed.toLocaleString("pt-BR")}</span>
                <InfoTip text="Total de créditos gastos no período selecionado, somando todas as tarefas de IA (análises, consultas, formulações, etc.) de todos os nutricionistas. Fonte: transações de crédito do tipo débito." />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">de {m.creditsAvailable.toLocaleString("pt-BR")}</span>
                <InfoTip text="Capacidade total disponível: soma do saldo atual + cota mensal do plano de todos os usuários. Representa o teto de créditos que a base pode consumir antes de comprar pacotes extras." />
              </div>
            </div>
            <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full transition-all"
                style={{ width: `${Math.min(100, creditsRatio * 100).toFixed(1)}%`, background: barColor }}
              />
            </div>
            <div className="mt-2 flex items-center gap-1.5">
              <p className="text-xs font-mono" style={{ color: barColor }}>
                {(creditsRatio * 100).toFixed(1)}% utilizados
              </p>
              <InfoTip text="Percentual = consumidos ÷ disponíveis. Ajuda a antecipar quando a base vai precisar de recarga ou upgrade de plano." />
            </div>
          </div>
        </Card>
      </div>

      {/* Bloco 3 — ação operacional */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="p-6 rounded-2xl">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-sm">
              Usuários inativos há +15 dias
              <span className="ml-2 font-mono text-xs text-muted-foreground">{m.inactiveCount.toLocaleString("pt-BR")}</span>
            </h3>
            <Link to="/app/admin/users" className="text-xs text-muted-foreground hover:text-foreground">Ver todos →</Link>
          </div>
          <ul className="space-y-2">
            {m.inactive.map((u) => (
              <li key={u.id} className="flex items-center justify-between py-2 border-b last:border-0 text-sm">
                <div>
                  <p className="font-medium">{u.full_name || "—"}</p>
                  <p className="text-xs text-muted-foreground">{u.email}</p>
                </div>
                <span className="text-xs text-muted-foreground font-mono">
                  {u.last ? format(new Date(u.last), "dd/MM/yyyy", { locale: ptBR }) : "nunca"}
                </span>
              </li>
            ))}
            {m.inactive.length === 0 && <li className="text-sm text-muted-foreground py-4 text-center">Nenhum usuário inativo.</li>}
          </ul>
        </Card>

        <Card className="p-6 rounded-2xl" style={{ background: trialBg, borderColor: trialBorder }}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-sm">Trials expirando em 7 dias</h3>
            <Link to="/app/admin/plans" className="text-xs text-muted-foreground hover:text-foreground">Ver planos →</Link>
          </div>
          <ul className="space-y-2">
            {m.trialExpiring.map((s) => (
              <li key={s.user_id} className="flex items-center justify-between py-2 border-b last:border-0 text-sm border-[oklch(0.85_0.08_75)]">
                <div>
                  <p className="font-medium">{s.full_name || "—"}</p>
                  <p className="text-xs text-muted-foreground">{s.email} · {s.plan_type ?? "—"}</p>
                </div>
                <span className="text-xs font-mono">{format(new Date(s.current_period_end), "dd/MM", { locale: ptBR })}</span>
              </li>
            ))}
            {m.trialExpiring.length === 0 && <li className="text-sm text-muted-foreground py-4 text-center">Nenhum trial expira em breve.</li>}
          </ul>
        </Card>
      </div>

      {/* Bloco 4 — tabelas inteligência */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="p-6 rounded-2xl">
          <h3 className="font-semibold text-sm mb-4">Top nutricionistas por uso · {PERIOD_LABEL[period]}</h3>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1.5px solid var(--border)" }}>
                {["Nome", "Análises", "Exames", "Conversas", "Última"].map((h) => (
                  <th key={h} className="text-left py-2"
                    style={{ fontSize: "11px", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted-foreground)" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {m.topNutris.map((n) => (
                <tr key={n.id} className="border-b last:border-0 transition-colors hover:bg-muted/40">
                  <td className="py-2 font-medium">{n.full_name || n.email}</td>
                  <td className="py-2 font-mono">{n.analyses}</td>
                  <td className="py-2 font-mono">{n.exams}</td>
                  <td className="py-2 font-mono">{n.chats}</td>
                  <td className="py-2 text-xs text-muted-foreground font-mono">
                    {n.last ? format(new Date(n.last), "dd/MM", { locale: ptBR }) : "—"}
                  </td>
                </tr>
              ))}
              {m.topNutris.length === 0 && (
                <tr><td colSpan={5} className="py-6 text-center text-sm text-muted-foreground">Nenhuma atividade no período.</td></tr>
              )}
            </tbody>
          </table>
        </Card>

        <Card className="p-6 rounded-2xl">
          <h3 className="font-semibold text-sm mb-4">Registros recentes</h3>
          <ul className="space-y-2">
            {m.logs.map((l) => (
              <li key={l.id} className="flex items-start gap-3 py-2 border-b last:border-0 text-sm">
                <span className="text-xs font-mono text-muted-foreground whitespace-nowrap">
                  {format(new Date(l.created_at), "dd/MM HH:mm")}
                </span>
                <SeverityBadge status={l.status} />
                <span className="flex-1 truncate text-xs">{l.event}{l.message ? ` — ${l.message}` : ""}</span>
              </li>
            ))}
            {m.logs.length === 0 && <li className="text-sm text-muted-foreground py-4 text-center">Nenhum registro.</li>}
          </ul>
        </Card>
      </div>

      {/* Bloco 5 — perfil da base */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="p-6 rounded-2xl">
          <h3 className="font-semibold text-sm mb-4">Crescimento de cadastros</h3>
          <div style={{ height: 180 }}>
            <ResponsiveContainer>
              <BarChart data={m.growth}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.005 285)" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="v" fill="#e89bcf" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-6 rounded-2xl">
          <h3 className="font-semibold text-sm mb-4">Distribuição por plano</h3>
          <div style={{ height: 180 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={planDist} dataKey="v" nameKey="name" innerRadius={45} outerRadius={70} paddingAngle={2}>
                  {planDist.map((d, i) => <Cell key={i} fill={d.c} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap justify-center gap-3 text-xs mt-2">
            {planDist.map((d) => (
              <span key={d.name} className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full" style={{ background: d.c }} />
                {d.name} <span className="font-mono">{d.v.toLocaleString("pt-BR")}</span>
              </span>
            ))}
          </div>
        </Card>

        <Card className="p-6 rounded-2xl">
          <h3 className="font-semibold text-sm mb-4">Ranking de uso · {PERIOD_LABEL[period]}</h3>
          <div className="space-y-3">
            {m.funcRank.map((f) => {
              const max = Math.max(...m.funcRank.map((x) => x.v), 1);
              return (
                <div key={f.name}>
                  <div className="flex justify-between text-xs mb-1">
                    <span>{f.name}</span>
                    <span className="font-mono">{f.v.toLocaleString("pt-BR")}</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-[#e8a04c] to-[#e89bcf]"
                      style={{ width: `${(f.v / max) * 100}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Kpi({ label, value, hint, style }: { label: string; value: number; hint?: string; style?: React.CSSProperties }) {
  return (
    <div className="rounded-2xl border bg-card shadow-sm" style={{ padding: 24, ...style }}>
      <p className="text-xs uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="font-mono font-bold text-4xl tracking-tight mt-2">{value.toLocaleString("pt-BR")}</p>
      {hint && <p className="text-xs text-muted-foreground mt-2">{hint}</p>}
    </div>
  );
}

function Mini({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="font-mono font-semibold text-xl mt-1">{value.toLocaleString("pt-BR")}</p>
      {hint && <p className="text-[11px] text-muted-foreground mt-0.5">{hint}</p>}
    </div>
  );
}

function SeverityBadge({ status }: { status: string }) {
  const map: Record<string, { hue: number; label: string }> = {
    success: { hue: 160, label: "INFO" },
    info: { hue: 160, label: "INFO" },
    warning: { hue: 65, label: "WARN" },
    error: { hue: 25, label: "ERROR" },
    failure: { hue: 25, label: "ERROR" },
  };
  const t = map[status?.toLowerCase()] ?? { hue: 285, label: status?.toUpperCase() || "—" };
  return (
    <span style={{
      backgroundColor: `oklch(0.96 0.04 ${t.hue})`,
      border: `1px solid oklch(0.7 0.12 ${t.hue})`,
      color: `oklch(0.4 0.12 ${t.hue})`,
      fontSize: 10, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.04em",
      borderRadius: 4, padding: "1px 6px",
    }}>{t.label}</span>
  );
}
