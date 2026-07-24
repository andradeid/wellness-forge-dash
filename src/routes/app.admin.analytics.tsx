import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getUsageStats } from "@/lib/analytics-admin.functions";
import { OperationalAnalyticsSection } from "@/components/admin/OperationalAnalyticsSection";
import { Activity, MessageSquare, FlaskConical, Coins } from "lucide-react";

export const Route = createFileRoute("/app/admin/analytics")({
  head: () => ({ meta: [{ title: "Analytics de uso — Lumma" }] }),
  component: AnalyticsPage,
});

type RangeKey = "24h" | "7d" | "30d" | "90d";
const RANGES: Record<RangeKey, { label: string; hours: number }> = {
  "24h": { label: "24 horas", hours: 24 },
  "7d": { label: "7 dias", hours: 24 * 7 },
  "30d": { label: "30 dias", hours: 24 * 30 },
  "90d": { label: "90 dias", hours: 24 * 90 },
};

interface Row {
  hour_bucket: string;
  active_users: number;
  messages_sent: number;
  exams_processed: number;
  credits_consumed: number;
}

const DAYS_PT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function AnalyticsPage() {
  const [range, setRange] = useState<RangeKey>("7d");
  const fetchStats = useServerFn(getUsageStats);

  const { data, isLoading } = useQuery({
    queryKey: ["usage-stats", range],
    queryFn: () => fetchStats({ data: { hours: RANGES[range].hours } }),
    staleTime: 60_000,
  });

  const rows: Row[] = (data?.rows ?? []) as Row[];

  const kpis = useMemo(() => {
    let peakUsers = 0, peakUsersHour = "";
    let totalMessages = 0, totalExams = 0, totalCredits = 0;
    const hourAgg = new Array(24).fill(0); // por hora do dia
    for (const r of rows) {
      totalMessages += r.messages_sent;
      totalExams += r.exams_processed;
      totalCredits += r.credits_consumed;
      if (r.active_users > peakUsers) {
        peakUsers = r.active_users;
        peakUsersHour = r.hour_bucket;
      }
      const h = new Date(r.hour_bucket).getHours();
      hourAgg[h] += r.messages_sent;
    }
    let busiestHour = 0, busiestHourVal = 0;
    hourAgg.forEach((v, i) => { if (v > busiestHourVal) { busiestHourVal = v; busiestHour = i; } });
    return { peakUsers, peakUsersHour, totalMessages, totalExams, totalCredits, busiestHour };
  }, [rows]);

  const lineData = useMemo(() => {
    const compact = range === "24h";
    return rows.map((r) => ({
      label: format(new Date(r.hour_bucket), compact ? "HH:mm" : "dd/MM HH'h'", { locale: ptBR }),
      Usuários: r.active_users,
      Mensagens: r.messages_sent,
      Exames: r.exams_processed,
    }));
  }, [rows, range]);

  // Heatmap dia-da-semana × hora (soma de mensagens)
  const heatmap = useMemo(() => {
    const grid: number[][] = Array.from({ length: 7 }, () => new Array(24).fill(0));
    for (const r of rows) {
      const d = new Date(r.hour_bucket);
      grid[d.getDay()][d.getHours()] += r.messages_sent;
    }
    const max = Math.max(1, ...grid.flat());
    return { grid, max };
  }, [rows]);

  // Top 10 horários com mais mensagens
  const topHours = useMemo(() => {
    return [...rows]
      .sort((a, b) => b.messages_sent - a.messages_sent)
      .slice(0, 10);
  }, [rows]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Analytics de uso</h1>
          <p className="text-sm text-muted-foreground">
            Picos históricos + resumo operacional e saúde Langfuse (sob demanda, sem Realtime).
          </p>
        </div>
        <div className="flex gap-2">
          {(Object.keys(RANGES) as RangeKey[]).map((k) => (
            <Button
              key={k}
              size="sm"
              variant={range === k ? "default" : "outline"}
              onClick={() => setRange(k)}
              className={range === k ? "bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] text-white border-0" : ""}
            >
              {RANGES[k].label}
            </Button>
          ))}
        </div>
      </div>

      {/* Sempre carrega o resumo operacional do período, mesmo se hourly estiver vazio */}
      <OperationalAnalyticsSection hours={RANGES[range].hours} />

      {isLoading ? (
        <Card className="p-12 text-center text-sm text-muted-foreground">Carregando gráficos…</Card>
      ) : rows.length === 0 ? (
        <Card className="p-12 text-center text-sm text-muted-foreground">
          Sem dados de série horária nesse período ainda.
        </Card>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              icon={<Activity className="h-4 w-4" />}
              label="Pico de usuários/hora"
              value={String(kpis.peakUsers)}
              hint={kpis.peakUsersHour ? format(new Date(kpis.peakUsersHour), "dd/MM 'às' HH'h'", { locale: ptBR }) : "—"}
            />
            <KpiCard
              icon={<MessageSquare className="h-4 w-4" />}
              label="Mensagens totais"
              value={kpis.totalMessages.toLocaleString("pt-BR")}
              hint={`Hora mais ativa: ${String(kpis.busiestHour).padStart(2, "0")}h`}
            />
            <KpiCard
              icon={<FlaskConical className="h-4 w-4" />}
              label="Exames processados"
              value={kpis.totalExams.toLocaleString("pt-BR")}
              hint="No período selecionado"
            />
            <KpiCard
              icon={<Coins className="h-4 w-4" />}
              label="Créditos consumidos"
              value={kpis.totalCredits.toLocaleString("pt-BR")}
              hint="Soma dos débitos"
            />
          </div>

          {/* Gráfico de linha */}
          <Card className="p-4">
            <h2 className="text-sm font-medium text-foreground mb-4">Atividade ao longo do tempo</h2>
            <div style={{ width: "100%", height: 320 }}>
              <ResponsiveContainer>
                <LineChart data={lineData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={20} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="Usuários" stroke="#e8a04c" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="Mensagens" stroke="#e89bcf" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="Exames" stroke="#7c9c7c" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Heatmap */}
          <Card className="p-4">
            <h2 className="text-sm font-medium text-foreground mb-1">Heatmap dia × hora</h2>
            <p className="text-xs text-muted-foreground mb-4">
              Intensidade = mensagens enviadas. Mais escuro = mais atividade.
            </p>
            <div className="overflow-x-auto">
              <table className="text-[10px] border-separate border-spacing-1">
                <thead>
                  <tr>
                    <th className="w-8"></th>
                    {Array.from({ length: 24 }, (_, i) => (
                      <th key={i} className="w-7 text-center font-normal text-muted-foreground">
                        {String(i).padStart(2, "0")}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {heatmap.grid.map((row, di) => (
                    <tr key={di}>
                      <td className="text-muted-foreground pr-1">{DAYS_PT[di]}</td>
                      {row.map((v, hi) => {
                        const alpha = v === 0 ? 0 : 0.15 + (v / heatmap.max) * 0.85;
                        return (
                          <td
                            key={hi}
                            title={`${DAYS_PT[di]} ${String(hi).padStart(2, "0")}h — ${v} msgs`}
                            className="w-7 h-6 rounded"
                            style={{
                              background: v === 0
                                ? "hsl(var(--muted))"
                                : `rgba(232, 155, 207, ${alpha})`,
                            }}
                          />
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Top horários */}
          <Card className="p-4">
            <h2 className="text-sm font-medium text-foreground mb-4">Top 10 horários de pico</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b">
                    <th className="py-2 pr-4 font-normal">#</th>
                    <th className="py-2 pr-4 font-normal">Data/hora</th>
                    <th className="py-2 pr-4 font-normal text-right">Usuários</th>
                    <th className="py-2 pr-4 font-normal text-right">Mensagens</th>
                    <th className="py-2 pr-4 font-normal text-right">Exames</th>
                    <th className="py-2 font-normal text-right">Créditos</th>
                  </tr>
                </thead>
                <tbody>
                  {topHours.map((r, i) => (
                    <tr key={r.hour_bucket} className="border-b last:border-0">
                      <td className="py-2 pr-4 text-muted-foreground">{i + 1}</td>
                      <td className="py-2 pr-4">
                        {format(new Date(r.hour_bucket), "EEE, dd/MM 'às' HH'h'", { locale: ptBR })}
                      </td>
                      <td className="py-2 pr-4 text-right font-medium">{r.active_users}</td>
                      <td className="py-2 pr-4 text-right">{r.messages_sent}</td>
                      <td className="py-2 pr-4 text-right">{r.exams_processed}</td>
                      <td className="py-2 text-right">{r.credits_consumed}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function KpiCard({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2">
        {icon}
        <span>{label}</span>
      </div>
      <div className="text-2xl font-semibold text-foreground">{value}</div>
      <div className="text-xs text-muted-foreground mt-1">{hint}</div>
    </Card>
  );
}
