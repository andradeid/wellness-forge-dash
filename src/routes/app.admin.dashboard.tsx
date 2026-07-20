import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { format, startOfDay, startOfMonth, startOfWeek, startOfYear, subDays, subMonths, subWeeks } from "date-fns";
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
const CHIP_ACTIVE = {
  backgroundColor: "oklch(0.94 0.04 285)",
  borderColor: "oklch(0.42 0.18 285)",
  color: "oklch(0.42 0.18 285)",
} as const;

function periodStart(p: Period): Date {
  const now = new Date();
  if (p === "today") return startOfDay(now);
  if (p === "week") return startOfWeek(now, { weekStartsOn: 1 });
  if (p === "month") return startOfMonth(now);
  return startOfYear(now);
}

function pct(curr: number, prev: number): { txt: string; up: boolean } {
  if (prev === 0) return { txt: curr > 0 ? "novo" : "—", up: curr >= 0 };
  const v = ((curr - prev) / prev) * 100;
  const up = v >= 0;
  return { txt: `${up ? "↑" : "↓"} ${Math.abs(v).toFixed(0)}% vs mês anterior`, up };
}

interface NutriProfile { id: string; full_name: string | null; email: string; created_at: string; }
interface Subscription { user_id: string; status: string | null; plan_type: string | null; current_period_end: string | null; }

function AdminDashboardPage() {
  const [period, setPeriod] = useState<Period>("month");
  const [loading, setLoading] = useState(true);

  const [nutris, setNutris] = useState<NutriProfile[]>([]);
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [chats, setChats] = useState<{ id: string; created_at: string; created_by: string }[]>([]);
  const [exams, setExams] = useState<{ id: string; created_at: string; uploaded_by: string }[]>([]);
  const [txs, setTxs] = useState<{ user_id: string; created_at: string; amount: number; type: string; agent_key: string | null }[]>([]);
  const [credits, setCredits] = useState<{ user_id: string; balance: number; monthly_quota: number }[]>([]);
  const [feedbacks, setFeedbacks] = useState<{ id: string; rating: string | null; comment: string | null; created_at: string }[]>([]);
  const [errorLogs, setErrorLogs] = useState<{ id: string; created_at: string; event: string; status: string; message: string | null }[]>([]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [rolesR, chatsR, examsR, txR, credR, fbR, logsR] = await Promise.all([
        (supabase as any).from("user_roles").select("user_id").eq("role", "nutri"),
        (supabase as any).from("patient_chats").select("id, created_at, created_by"),
        (supabase as any).from("patient_exams").select("id, created_at, uploaded_by"),
        (supabase as any).from("credit_transactions").select("user_id, created_at, amount, type, agent_key"),
        (supabase as any).from("user_credits").select("user_id, balance, monthly_quota"),
        (supabase as any).from("ai_feedback").select("id, rating, comment, created_at").order("created_at", { ascending: false }).limit(8),
        (supabase as any).from("integration_logs").select("id, created_at, event, status, message").order("created_at", { ascending: false }).limit(8),
      ]);
      const ids = (rolesR.data ?? []).map((r: any) => r.user_id);
      if (ids.length) {
        const [profR, subR] = await Promise.all([
          (supabase as any).from("profiles").select("id, full_name, email, created_at").in("id", ids),
          (supabase as any).from("subscriptions").select("user_id, status, plan_type, current_period_end").in("user_id", ids),
        ]);
        setNutris(profR.data ?? []);
        setSubs(subR.data ?? []);
      }
      setChats(chatsR.data ?? []);
      setExams(examsR.data ?? []);
      setTxs(txR.data ?? []);
      setCredits(credR.data ?? []);
      setFeedbacks(fbR.data ?? []);
      setErrorLogs(logsR.data ?? []);
      setLoading(false);
    })();
  }, []);

  const now = new Date();
  const since = periodStart(period);

  const m = useMemo(() => {
    const monthStart = startOfMonth(now);
    const prevMonthStart = startOfMonth(subMonths(now, 1));
    const days30 = subDays(now, 30);
    const days15 = subDays(now, 15);
    const next7 = new Date(now.getTime() + 7 * 24 * 3600 * 1000);

    // Atividade por usuário (últimos 30d)
    const actSet = new Set<string>();
    chats.forEach((c) => { if (new Date(c.created_at) >= days30) actSet.add(c.created_by); });
    exams.forEach((e) => { if (new Date(e.created_at) >= days30) actSet.add(e.uploaded_by); });
    txs.forEach((t) => { if (new Date(t.created_at) >= days30 && t.type === "debit") actSet.add(t.user_id); });

    const activeSubs = subs.filter((s) => s.status === "active").length;
    const trialSubs = subs.filter((s) => s.status === "trial").length;
    const trialExpiring = subs.filter((s) =>
      s.status === "trial" && s.current_period_end &&
      new Date(s.current_period_end) >= now && new Date(s.current_period_end) <= next7,
    );

    // MoM: subs ativas criadas até final do mês prev vs atual (proxy via current_period_end>now)
    const subsThisMonth = subs.filter((s) => s.status === "active").length;
    const trialThisMonth = trialSubs;
    // Análises = credit_transactions type=debit
    const analysesAll = txs.filter((t) => t.type === "debit");
    const analysesMonth = analysesAll.filter((t) => new Date(t.created_at) >= monthStart).length;
    const analysesPrev = analysesAll.filter((t) => {
      const d = new Date(t.created_at);
      return d >= prevMonthStart && d < monthStart;
    }).length;

    const examsMonth = exams.filter((e) => new Date(e.created_at) >= monthStart).length;
    const chatsMonth = chats.filter((c) => new Date(c.created_at) >= monthStart).length;

    // Última atividade por user
    const lastAct = new Map<string, Date>();
    const touch = (uid: string, d: string) => {
      const dt = new Date(d);
      const prev = lastAct.get(uid);
      if (!prev || prev < dt) lastAct.set(uid, dt);
    };
    chats.forEach((c) => touch(c.created_by, c.created_at));
    exams.forEach((e) => touch(e.uploaded_by, e.created_at));
    txs.forEach((t) => touch(t.user_id, t.created_at));

    const inactive = nutris
      .filter((n) => {
        const la = lastAct.get(n.id);
        return !la || la < days15;
      })
      .map((n) => ({ ...n, last: lastAct.get(n.id) ?? null }))
      .sort((a, b) => (a.last?.getTime() ?? 0) - (b.last?.getTime() ?? 0));

    // Top nutris por análises
    const perUser = new Map<string, { analyses: number; exams: number; chats: number; last: Date | null }>();
    const ensure = (u: string) => {
      if (!perUser.has(u)) perUser.set(u, { analyses: 0, exams: 0, chats: 0, last: null });
      return perUser.get(u)!;
    };
    analysesAll.forEach((t) => { ensure(t.user_id).analyses += 1; });
    exams.forEach((e) => { ensure(e.uploaded_by).exams += 1; });
    chats.forEach((c) => { ensure(c.created_by).chats += 1; });
    perUser.forEach((v, k) => { v.last = lastAct.get(k) ?? null; });

    const topNutris = nutris
      .map((n) => ({ ...n, stats: perUser.get(n.id) ?? { analyses: 0, exams: 0, chats: 0, last: null } }))
      .sort((a, b) => b.stats.analyses - a.stats.analyses)
      .slice(0, 8);

    // Créditos consumidos / disponíveis no mês
    const creditsConsumedMonth = analysesAll
      .filter((t) => new Date(t.created_at) >= monthStart)
      .reduce((s, t) => s + (t.amount ?? 0), 0);
    const creditsAvailable = credits.reduce((s, c) => s + (c.balance ?? 0) + (c.monthly_quota ?? 0), 0);
    const creditsRatio = creditsAvailable > 0 ? creditsConsumedMonth / creditsAvailable : 0;

    // Linha — análises por semana (8 semanas)
    const weekly: { label: string; v: number }[] = [];
    for (let i = 7; i >= 0; i--) {
      const ws = startOfWeek(subWeeks(now, i), { weekStartsOn: 1 });
      const we = startOfWeek(subWeeks(now, i - 1), { weekStartsOn: 1 });
      const v = analysesAll.filter((t) => {
        const d = new Date(t.created_at);
        return d >= ws && d < we;
      }).length;
      weekly.push({ label: format(ws, "dd/MM", { locale: ptBR }), v });
    }

    // Crescimento cadastros (6 meses)
    const growth: { label: string; v: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const ms = startOfMonth(subMonths(now, i));
      const me = startOfMonth(subMonths(now, i - 1));
      const v = nutris.filter((n) => {
        const d = new Date(n.created_at);
        return d >= ms && d < me;
      }).length;
      growth.push({ label: format(ms, "MMM", { locale: ptBR }), v });
    }

    // Distribuição por plano
    const planMap = { free: 0, trial: 0, paid: 0 };
    subs.forEach((s) => {
      if (s.status === "trial") planMap.trial += 1;
      else if (s.status === "active") planMap.paid += 1;
      else planMap.free += 1;
    });
    const planDist = [
      { name: "Gratuito", v: planMap.free, c: "#cbd5e1" },
      { name: "Trial", v: planMap.trial, c: "#e8a04c" },
      { name: "Pago", v: planMap.paid, c: "#e89bcf" },
    ];

    // Ranking funcionalidades
    const funcRank = [
      { name: "Análise IA", v: analysesAll.length },
      { name: "Conversas", v: chats.length },
      { name: "Exames", v: exams.length },
    ].sort((a, b) => b.v - a.v);

    // Filtro por período aplicado a métricas dependentes (linha do gráfico não muda — sempre 8 semanas)
    const periodAnalyses = analysesAll.filter((t) => new Date(t.created_at) >= since).length;
    const periodExams = exams.filter((e) => new Date(e.created_at) >= since).length;
    const periodChats = chats.filter((c) => new Date(c.created_at) >= since).length;

    return {
      activeNutris: actSet.size,
      activeSubs, trialSubs, trialExpiring,
      analysesMonth, analysesPrev, examsMonth, chatsMonth,
      subsThisMonth, trialThisMonth,
      inactive, topNutris,
      creditsConsumedMonth, creditsAvailable, creditsRatio,
      weekly, growth, planDist, funcRank,
      periodAnalyses, periodExams, periodChats,
    };
  }, [nutris, subs, chats, exams, txs, credits, period]);

  const subById = useMemo(() => {
    const map = new Map<string, Subscription>();
    subs.forEach((s) => map.set(s.user_id, s));
    return map;
  }, [subs]);

  const trialBg = "oklch(0.98 0.03 75)";
  const trialBorder = "oklch(0.85 0.12 75)";

  const analysesPct = pct(m.analysesMonth, m.analysesPrev);

  const barColor =
    m.creditsRatio > 0.95 ? "oklch(0.55 0.18 25)" :
    m.creditsRatio > 0.80 ? "oklch(0.7 0.15 65)" :
    "oklch(0.55 0.15 285)";

  if (loading) {
    return <div className="py-20 text-center text-sm text-muted-foreground">Carregando dashboard...</div>;
  }

  return (
    <div className="space-y-8 max-w-7xl">
      {/* Header + filtros */}
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-serif text-2xl font-semibold tracking-tight text-foreground">
            Visão geral do <span className="italic text-gradient-brand">negócio</span>
          </h1>
        </div>

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
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4">
        <Kpi label="Nutricionistas Ativos" value={m.activeNutris} hint="últimos 30 dias" />
        <Kpi label="Assinaturas Ativas" value={m.activeSubs} hint={analysesPct.txt} />
        <Kpi label="Em Trial" value={m.trialSubs} hint="vigentes" />
        <Kpi
          label="Trials expirando em 7d"
          value={m.trialExpiring.length}
          hint="atenção necessária"
          style={{ background: trialBg, borderColor: trialBorder }}
        />
      </div>

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
            <Mini label="Análises (mês)" value={m.analysesMonth} />
            <Mini label="Exames anexados" value={m.examsMonth} />
            <Mini label="Conversas abertas" value={m.chatsMonth} />
          </div>
        </Card>

        <Card className="p-6 rounded-2xl">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-semibold text-sm">Créditos</h3>
              <p className="text-xs text-muted-foreground mt-1">Consumo do mês</p>
            </div>
            <InfoTip text="Panorama de créditos do mês corrente para toda a plataforma (todos os nutricionistas somados). Serve para acompanhar o consumo agregado da operação, não o saldo de um usuário específico." />
          </div>
          <div className="mt-6">
            <div className="flex items-baseline justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-2xl">{m.creditsConsumedMonth.toLocaleString("pt-BR")}</span>
                <InfoTip text="Total de créditos gastos neste mês, somando todas as tarefas de IA (análises, consultas, formulações, etc.) de todos os nutricionistas. Fonte: tabela analyses_tasks, campo amount, filtrado a partir do dia 1 do mês atual." />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">de {m.creditsAvailable.toLocaleString("pt-BR")}</span>
                <InfoTip text="Capacidade total disponível: soma do saldo atual (balance) + cota mensal do plano (monthly_quota) de todos os usuários. Representa o teto de créditos que a base pode consumir antes de comprar pacotes extras." />
              </div>
            </div>
            <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full transition-all"
                style={{ width: `${Math.min(100, m.creditsRatio * 100).toFixed(1)}%`, background: barColor }}
              />
            </div>
            <div className="mt-2 flex items-center gap-1.5">
              <p className="text-xs font-mono" style={{ color: barColor }}>
                {(m.creditsRatio * 100).toFixed(1)}% utilizados
              </p>
              <InfoTip text="Percentual = consumidos ÷ disponíveis. Verde até 60%, âmbar de 60% a 85%, vermelho acima de 85% — ajuda a antecipar quando a base vai precisar de recarga ou upgrade de plano." />
            </div>
          </div>
        </Card>
      </div>

      {/* Bloco 3 — ação operacional */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="p-6 rounded-2xl">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-sm">Usuários inativos há +15 dias</h3>
            <Link to="/app/admin/users" className="text-xs text-muted-foreground hover:text-foreground">Ver todos →</Link>
          </div>
          <ul className="space-y-2">
            {m.inactive.slice(0, 5).map((u) => (
              <li key={u.id} className="flex items-center justify-between py-2 border-b last:border-0 text-sm">
                <div>
                  <p className="font-medium">{u.full_name || "—"}</p>
                  <p className="text-xs text-muted-foreground">{u.email}</p>
                </div>
                <span className="text-xs text-muted-foreground font-mono">
                  {u.last ? format(u.last, "dd/MM/yyyy", { locale: ptBR }) : "nunca"}
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
            {m.trialExpiring.slice(0, 6).map((s) => {
              const n = nutris.find((x) => x.id === s.user_id);
              return (
                <li key={s.user_id} className="flex items-center justify-between py-2 border-b last:border-0 text-sm border-[oklch(0.85_0.08_75)]">
                  <div>
                    <p className="font-medium">{n?.full_name || "—"}</p>
                    <p className="text-xs text-muted-foreground">{n?.email} · {s.plan_type ?? "—"}</p>
                  </div>
                  <span className="text-xs font-mono">{s.current_period_end ? format(new Date(s.current_period_end), "dd/MM", { locale: ptBR }) : "—"}</span>
                </li>
              );
            })}
            {m.trialExpiring.length === 0 && <li className="text-sm text-muted-foreground py-4 text-center">Nenhum trial expira em breve.</li>}
          </ul>
        </Card>
      </div>

      {/* Bloco 4 — tabelas inteligência */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="p-6 rounded-2xl">
          <h3 className="font-semibold text-sm mb-4">Top nutricionistas por uso</h3>
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
                <tr key={n.id} className="border-b last:border-0 transition-colors"
                  onMouseEnter={(e) => (e.currentTarget.style.background = "oklch(0.97 0.006 285)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "")}>
                  <td className="py-2 font-medium">{n.full_name || n.email}</td>
                  <td className="py-2 font-mono">{n.stats.analyses}</td>
                  <td className="py-2 font-mono">{n.stats.exams}</td>
                  <td className="py-2 font-mono">{n.stats.chats}</td>
                  <td className="py-2 text-xs text-muted-foreground font-mono">
                    {n.stats.last ? format(n.stats.last, "dd/MM", { locale: ptBR }) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card className="p-6 rounded-2xl">
          <h3 className="font-semibold text-sm mb-4">
            {errorLogs.length > 0 ? "Erros recentes" : "Feedbacks recentes"}
          </h3>
          <ul className="space-y-2">
            {errorLogs.length > 0
              ? errorLogs.map((l) => (
                  <li key={l.id} className="flex items-start gap-3 py-2 border-b last:border-0 text-sm">
                    <span className="text-xs font-mono text-muted-foreground whitespace-nowrap">
                      {format(new Date(l.created_at), "dd/MM HH:mm")}
                    </span>
                    <SeverityBadge status={l.status} />
                    <span className="flex-1 truncate text-xs">{l.event}{l.message ? ` — ${l.message}` : ""}</span>
                  </li>
                ))
              : feedbacks.map((f) => (
                  <li key={f.id} className="flex items-start gap-3 py-2 border-b last:border-0 text-sm">
                    <span className="text-xs font-mono text-muted-foreground whitespace-nowrap">
                      {format(new Date(f.created_at), "dd/MM")}
                    </span>
                    <span className="text-xs uppercase tracking-wider px-2 py-0.5 rounded"
                      style={{
                        background: f.rating === "positive" ? "oklch(0.96 0.04 160)" : "oklch(0.96 0.04 25)",
                        color: f.rating === "positive" ? "oklch(0.4 0.12 160)" : "oklch(0.4 0.12 25)",
                      }}>
                      {f.rating ?? "—"}
                    </span>
                    <span className="flex-1 text-xs text-muted-foreground truncate">{f.comment || "(sem comentário)"}</span>
                  </li>
                ))}
            {errorLogs.length === 0 && feedbacks.length === 0 && (
              <li className="text-sm text-muted-foreground py-4 text-center">Nenhum registro.</li>
            )}
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
                <Pie data={m.planDist} dataKey="v" nameKey="name" innerRadius={45} outerRadius={70} paddingAngle={2}>
                  {m.planDist.map((d, i) => <Cell key={i} fill={d.c} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-center gap-3 text-xs mt-2">
            {m.planDist.map((d) => (
              <span key={d.name} className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full" style={{ background: d.c }} />
                {d.name} <span className="font-mono">{d.v}</span>
              </span>
            ))}
          </div>
        </Card>

        <Card className="p-6 rounded-2xl">
          <h3 className="font-semibold text-sm mb-4">Ranking de uso</h3>
          <div className="space-y-3">
            {m.funcRank.map((f) => {
              const max = Math.max(...m.funcRank.map((x) => x.v), 1);
              return (
                <div key={f.name}>
                  <div className="flex justify-between text-xs mb-1">
                    <span>{f.name}</span>
                    <span className="font-mono">{f.v}</span>
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

function Mini({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="font-mono font-semibold text-xl mt-1">{value.toLocaleString("pt-BR")}</p>
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
