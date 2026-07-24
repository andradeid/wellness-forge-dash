import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Trophy, Medal, Award, Activity, ExternalLink, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/admin/ranking")({
  component: RankingPage,
});

type Period = "24h" | "7d" | "month" | "all" | "custom";

interface RankRow {
  user_id: string;
  full_name: string | null;
  email: string;
  avatar_url: string | null;
  professional_id: string | null;
  total: number;
  feedbacks: number;
  exams: number;
  last_activity: string | null;
}

function periodRange(p: Period, customFrom?: string, customTo?: string): { start: Date | null; end: Date | null } {
  const now = new Date();
  if (p === "24h") {
    const d = new Date(now);
    d.setHours(d.getHours() - 24);
    return { start: d, end: null };
  }
  if (p === "month") return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: null };
  if (p === "7d") {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    return { start: d, end: null };
  }
  if (p === "custom") {
    const s = customFrom ? new Date(customFrom + "T00:00:00") : null;
    const e = customTo ? new Date(customTo + "T23:59:59") : null;
    return { start: s, end: e };
  }
  return { start: null, end: null };
}


function RankingPage() {
  const { role } = useAuth();
  const navigate = useNavigate();
  const [period, setPeriod] = useState<Period>("month");
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");
  const [rows, setRows] = useState<RankRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (role && role !== "super_admin") {
      navigate({ to: "/app/dashboard", replace: true });
    }
  }, [role, navigate]);

  useEffect(() => {
    if (role !== "super_admin") return;
    if (period === "custom" && (!customFrom || !customTo)) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { start, end } = periodRange(period, customFrom, customTo);
      const startIso = start ? start.toISOString() : null;
      const endIso = end ? end.toISOString() : null;

      const fbQ = (supabase as any)
        .from("ai_feedback")
        .select("id, created_at, created_by");
      const exQ = (supabase as any)
        .from("patient_exam_results")
        .select("id, created_at, created_by");
      if (startIso) {
        fbQ.gte("created_at", startIso);
        exQ.gte("created_at", startIso);
      }
      if (endIso) {
        fbQ.lte("created_at", endIso);
        exQ.lte("created_at", endIso);
      }


      const [fbRes, exRes] = await Promise.all([fbQ, exQ]);
      if (fbRes.error || exRes.error) {
        toast.error(fbRes.error?.message || exRes.error?.message);
        if (!cancelled) setLoading(false);
        return;
      }

      const agg = new Map<
        string,
        { feedbacks: number; exams: number; last: string | null }
      >();
      const bump = (uid: string, at: string, key: "feedbacks" | "exams") => {
        if (!uid) return;
        const cur = agg.get(uid) ?? { feedbacks: 0, exams: 0, last: null };
        cur[key] += 1;
        if (!cur.last || at > cur.last) cur.last = at;
        agg.set(uid, cur);
      };
      (fbRes.data ?? []).forEach((r: any) => bump(r.created_by, r.created_at, "feedbacks"));
      (exRes.data ?? []).forEach((r: any) => bump(r.created_by, r.created_at, "exams"));

      const ids = Array.from(agg.keys());
      if (ids.length === 0) {
        if (!cancelled) {
          setRows([]);
          setLoading(false);
        }
        return;
      }

      const { data: profiles } = await (supabase as any)
        .from("profiles")
        .select("id, full_name, email, avatar_url, professional_id")
        .in("id", ids);

      const profMap = new Map<string, any>();
      (profiles ?? []).forEach((p: any) => profMap.set(p.id, p));

      const merged: RankRow[] = ids.map((uid) => {
        const a = agg.get(uid)!;
        const p = profMap.get(uid);
        return {
          user_id: uid,
          full_name: p?.full_name ?? null,
          email: p?.email ?? "—",
          avatar_url: p?.avatar_url ?? null,
          professional_id: p?.professional_id ?? null,
          total: a.feedbacks + a.exams,
          feedbacks: a.feedbacks,
          exams: a.exams,
          last_activity: a.last,
        };
      });

      merged.sort((a, b) => b.total - a.total);
      if (!cancelled) {
        setRows(merged);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [role, period, customFrom, customTo]);

  const top3 = useMemo(() => rows.slice(0, 3), [rows]);
  const rest = useMemo(() => rows.slice(3), [rows]);

  if (role && role !== "super_admin") return null;

  return (
    <div className="max-w-6xl">
      <div className="mb-4 space-y-2">
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
          <span>Operação</span>
          <ChevronRight className="h-3 w-3" />
          <span className="text-foreground/80">Ranking de uso</span>
        </div>
        <div className="flex items-center gap-2">
          <h1 className="font-serif text-2xl font-semibold tracking-tight text-foreground">
            Ranking de <span className="italic text-gradient-brand">uso</span>
          </h1>
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" className="text-muted-foreground hover:text-foreground" aria-label="O que é isso?">
                <Info className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs text-xs leading-relaxed">
              Conta <strong>ações clínicas</strong> do usuário: feedbacks de IA + resultados de exames processados. Diferente do <em>Top consumo</em> (Analytics), que conta débitos financeiros no ledger de créditos.
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1 rounded-full bg-muted/60 p-1">
          {(
            [
              { key: "24h", label: "24h" },
              { key: "7d", label: "7 dias" },
              { key: "month", label: "Este mês" },
              { key: "all", label: "Total" },
              { key: "custom", label: "Personalizado" },
            ] as { key: Period; label: string }[]
          ).map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setPeriod(p.key)}
              className={cn(
                "px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors",
                period === p.key
                  ? "bg-white shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        {period === "custom" && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="h-9 rounded-full border bg-white px-3 text-xs text-foreground"
            />
            <span className="text-xs text-muted-foreground">até</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="h-9 rounded-full border bg-white px-3 text-xs text-foreground"
            />
          </div>
        )}
      </div>


      {loading ? (
        <div className="mt-10 py-16 text-center text-sm text-muted-foreground">
          Carregando ranking...
        </div>
      ) : rows.length === 0 ? (
        <Card className="mt-10 rounded-2xl border-dashed">
          <CardContent className="py-16 text-center">
            <div className="h-12 w-12 mx-auto rounded-2xl bg-accent/60 flex items-center justify-center mb-4">
              <Trophy className="h-6 w-6 text-accent-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">
              Nenhuma atividade registrada no período selecionado.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="mt-10 space-y-10">
          {top3.length > 0 && (
            <div className="grid gap-5 md:grid-cols-3">
              {top3.map((r, i) => (
                <PodiumCard key={r.user_id} row={r} position={i + 1} />
              ))}
            </div>
          )}

          {rest.length > 0 && (
            <div className="space-y-3">
              {rest.map((r, i) => (
                <RankRowCard key={r.user_id} row={r} position={i + 4} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function podiumStyles(position: number) {
  if (position === 1)
    return {
      ring: "ring-2 ring-transparent bg-gradient-to-br from-[#e8a04c]/40 to-[#e89bcf]/40 p-[2px]",
      icon: Trophy,
      tone: "text-[#e8a04c]",
      label: "1º lugar",
    };
  if (position === 2)
    return {
      ring: "ring-2 ring-transparent bg-gradient-to-br from-slate-300 to-slate-400 p-[2px]",
      icon: Medal,
      tone: "text-slate-500",
      label: "2º lugar",
    };
  return {
    ring: "ring-2 ring-transparent bg-gradient-to-br from-amber-700/50 to-amber-500/40 p-[2px]",
    icon: Award,
    tone: "text-amber-700",
    label: "3º lugar",
  };
}

function PodiumCard({ row, position }: { row: RankRow; position: number }) {
  const s = podiumStyles(position);
  const Icon = s.icon;
  return (
    <div className={cn("rounded-3xl", s.ring)}>
      <Card className="rounded-[calc(1.5rem-2px)] border-0 bg-card shadow-sm h-full">
        <CardContent className="p-6 flex flex-col h-full">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              {s.label}
            </span>
            <Icon className={cn("h-5 w-5", s.tone)} />
          </div>

          <div className="flex items-center gap-4 mt-5">
            <Avatar className="h-14 w-14">
              <AvatarImage src={row.avatar_url ?? undefined} />
              <AvatarFallback className="bg-gradient-brand text-white text-sm font-semibold">
                {(row.full_name || row.email).slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="font-medium text-foreground truncate">
                {row.full_name || row.email}
              </div>
              <div className="text-xs text-muted-foreground truncate">
                {row.professional_id ? `CRN ${row.professional_id}` : "Nutricionista"}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mt-6">
            <Metric label="Análises" value={row.total} highlight />
            <Metric label="Última atividade" value={formatLast(row.last_activity)} small />
          </div>

          <div className="flex items-center justify-between mt-6 pt-4 border-t">
            <span className="text-[11px] text-muted-foreground">
              {row.feedbacks} feedbacks · {row.exams} exames
            </span>
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="rounded-full text-xs h-8"
            >
              <Link
                to="/app/admin/feedbacks"
                search={{ user: row.user_id } as any}
              >
                Ver perfil
                <ExternalLink className="h-3 w-3 ml-1.5" />
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function RankRowCard({ row, position }: { row: RankRow; position: number }) {
  return (
    <Card className="rounded-2xl border bg-card shadow-sm">
      <CardContent className="p-4 flex items-center gap-4">
        <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center text-sm font-semibold text-muted-foreground shrink-0">
          {position}
        </div>
        <Avatar className="h-10 w-10 shrink-0">
          <AvatarImage src={row.avatar_url ?? undefined} />
          <AvatarFallback className="bg-gradient-brand text-white text-xs font-semibold">
            {(row.full_name || row.email).slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-foreground truncate">
            {row.full_name || row.email}
          </div>
          <div className="text-xs text-muted-foreground truncate">
            {row.professional_id ? `CRN ${row.professional_id}` : "Nutricionista"}
          </div>
        </div>
        <div className="hidden md:flex flex-col items-end pr-4 border-r">
          <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Análises
          </span>
          <span className="text-lg font-semibold text-foreground flex items-center gap-1.5">
            <Activity className="h-4 w-4 text-muted-foreground" />
            {row.total}
          </span>
        </div>
        <div className="hidden md:flex flex-col items-end">
          <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Última atividade
          </span>
          <span className="text-sm text-foreground">
            {formatLast(row.last_activity)}
          </span>
        </div>
        <Button
          asChild
          variant="outline"
          size="sm"
          className="rounded-full ml-2"
        >
          <Link
            to="/app/admin/feedbacks"
            search={{ user: row.user_id } as any}
          >
            Ver perfil
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function Metric({
  label,
  value,
  highlight,
  small,
}: {
  label: string;
  value: number | string;
  highlight?: boolean;
  small?: boolean;
}) {
  return (
    <div className="rounded-xl bg-muted/40 px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "font-semibold text-foreground mt-0.5",
          highlight ? "text-2xl" : small ? "text-sm" : "text-base",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function formatLast(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const day = 24 * 60 * 60 * 1000;
  if (diffMs < day) {
    return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }
  const days = Math.floor(diffMs / day);
  if (days < 7) return `há ${days}d`;
  return d.toLocaleDateString("pt-BR");
}
