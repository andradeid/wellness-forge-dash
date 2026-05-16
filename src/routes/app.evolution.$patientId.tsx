import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useReactToPrint } from "react-to-print";
import {
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  Minus,
  Activity,
  Calendar,
  FileDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PatientReportPDF } from "@/components/branding/PatientReportPDF";
import { useBrandingProfile } from "@/hooks/useBrandingProfile";
import { format, differenceInYears } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceArea,
  ReferenceLine,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { QuickAnalysisDialog } from "@/components/QuickAnalysisDialog";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import lummaSymbol from "@/assets/lumma-symbol.svg";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/evolution/$patientId")({
  head: () => ({
    meta: [{ title: "Evolução clínica — Lumma" }],
  }),
  component: EvolutionPage,
});

interface PatientCtx {
  id: string;
  name: string;
  birth_date: string | null;
  gender: string | null;
  avatar_url: string | null;
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

type ToneKey = "otimo" | "atencao" | "critico" | "neutro";

function classify(c: string | null): ToneKey {
  const t = (c ?? "").toLowerCase();
  if (/(crític|critic|grave|severo)/.test(t)) return "critico";
  if (/(alto|elevad|acima|alterad|baixo|abaixo|deficien|atenç|atenc|alert)/.test(t))
    return "atencao";
  if (/(normal|adequad|dentro|preserv|esperad|ótim|otim)/.test(t)) return "otimo";
  return "neutro";
}

const toneClass: Record<ToneKey, string> = {
  otimo: "bg-emerald-50 text-emerald-700 border-emerald-200",
  atencao: "bg-amber-50 text-amber-700 border-amber-200",
  critico: "bg-rose-50 text-rose-700 border-rose-200",
  neutro: "bg-slate-100 text-slate-700 border-slate-200",
};

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
  const [userId, setUserId] = useState<string | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  const { data: branding } = useBrandingProfile(userId);
  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `Laudo-${patient?.name ?? "paciente"}`,
  });

  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any)
        .from("patients")
        .select("id, name, birth_date, gender, avatar_url")
        .eq("id", patientId)
        .maybeSingle();
      setPatient(data as PatientCtx | null);
    })();
  }, [patientId]);

  const reload = async () => {
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
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId]);

  // Group by marker name
  const groups = useMemo(() => {
    if (!rows) return [];
    const map = new Map<string, ResultRow[]>();
    for (const r of rows) {
      const key = r.marker_name.trim();
      if (!key) continue;
      const arr = map.get(key) ?? [];
      arr.push(r);
      map.set(key, arr);
    }
    const out = Array.from(map.entries()).map(([name, points]) => {
      points.sort((a, b) => a.measured_at.localeCompare(b.measured_at));
      return { name, points, latest: points[points.length - 1] };
    });
    out.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    return out;
  }, [rows]);

  // Distinct exam dates (each exam = one measured_at day)
  const examDates = useMemo(() => {
    if (!rows) return [];
    const set = new Set<string>();
    rows.forEach((r) => set.add(r.measured_at));
    return Array.from(set).sort((a, b) => b.localeCompare(a)); // recent first
  }, [rows]);

  useEffect(() => {
    if (!selected && groups.length) setSelected(groups[0].name);
  }, [groups, selected]);

  const active = groups.find((g) => g.name === selected) ?? null;
  const age = patient?.birth_date
    ? differenceInYears(new Date(), new Date(patient.birth_date))
    : null;

  if (patient === null) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#f5f5f0] overflow-hidden">
        <div className="flex flex-col items-center gap-4 px-6 text-center">
          <img src={lummaSymbol} alt="Lumma" className="h-14 w-14 animate-spin" />
          <div>
            <p className="text-lg font-medium animate-pulse bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] bg-clip-text text-transparent">
              Carregando dados do paciente…
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Aguarde um instante enquanto a Lumma prepara a evolução clínica.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen w-full bg-[#f5f5f0] overflow-hidden">
      {/* HEADER DEDICADO */}
      <header className="shrink-0 bg-white border-b">
        <div className="px-6 py-4 flex items-center gap-4">
          <Link
            to="/app/chat/$patientId"
            params={{ patientId }}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground rounded-full border px-3 py-1.5"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Voltar
          </Link>

          <Avatar className="h-12 w-12 ring-2 ring-[#e89bcf]/30 shrink-0">
            {patient.avatar_url && <AvatarImage src={patient.avatar_url} alt={patient.name} />}
            <AvatarFallback className="bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] text-white font-medium">
              {patient.name?.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase() ?? "?"}
            </AvatarFallback>
          </Avatar>

          <div className="min-w-0 flex-1">
            <div className="text-lg font-semibold truncate">
              {patient.name}
            </div>
            <div className="text-xs text-muted-foreground flex items-center gap-3 mt-0.5">
              {patient.birth_date && (
                <span className="inline-flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {format(new Date(patient.birth_date), "dd/MM/yyyy")}
                  {age !== null ? ` · ${age} anos` : ""}
                </span>
              )}
              {patient.gender && <span>{patient.gender}</span>}
              <span>· {examDates.length} exame(s) · {groups.length} marcador(es)</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              onClick={() => handlePrint?.()}
              disabled={!rows || rows.length === 0}
              variant="outline"
              size="sm"
              className="rounded-full gap-1.5"
            >
              <FileDown className="h-3.5 w-3.5" />
              Gerar Laudo PDF
            </Button>
            <QuickAnalysisDialog onCreated={() => reload()} />
          </div>
        </div>

        <div className="px-6 pb-4">
          <h1
            className="text-2xl bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] bg-clip-text text-transparent"
            style={{ fontFamily: "'Instrument Serif', serif" }}
          >
            Evolução clínica
          </h1>
          <p className="text-xs text-muted-foreground">
            Acompanhe a variação dos marcadores ao longo do tempo a partir dos exames enviados.
          </p>
        </div>
      </header>

      {/* CONTEÚDO */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {rows === null ? (
          <Skeleton className="h-80 w-full rounded-xl" />
        ) : groups.length === 0 ? (
          <Card className="p-10 text-center">
            <Activity className="h-10 w-10 mx-auto text-muted-foreground/60" />
            <p className="mt-3 text-sm text-muted-foreground">
              Sem dados para exibir. Envie um exame pelo chat ou use “Nova Análise Rápida” acima para começar.
            </p>
          </Card>
        ) : (
          <>
            <ChartCard
              groups={groups}
              selected={selected}
              setSelected={setSelected}
              active={active}
            />
            <ComparativeTable groups={groups} examDates={examDates} />
          </>
        )}
      </div>

      {/* Off-screen printable layout for "Gerar Laudo PDF" */}
      <div
        style={{ position: "fixed", left: "-10000px", top: 0, pointerEvents: "none" }}
        aria-hidden
      >
        <div ref={printRef}>
          {branding && rows && (
            <PatientReportPDF
              branding={branding}
              patient={{
                name: patient.name,
                birth_date: patient.birth_date,
                gender: patient.gender,
              }}
              markers={rows}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------- CHART CARD ---------------- */

function ChartCard({
  groups,
  selected,
  setSelected,
  active,
}: {
  groups: { name: string; points: ResultRow[]; latest: ResultRow }[];
  selected: string | null;
  setSelected: (v: string) => void;
  active: { name: string; points: ResultRow[]; latest: ResultRow } | null;
}) {
  if (!active) return null;
  const range = parseReferenceRange(active.latest.reference_value);
  const data = active.points
    .filter((p) => p.marker_value != null)
    .map((p) => ({
      date: format(new Date(p.measured_at), "dd/MM/yy", { locale: ptBR }),
      value: p.marker_value as number,
      classification: p.classification,
      raw: p.marker_value_raw,
    }));

  const yValues = data.map((d) => d.value);
  const minY = Math.min(...yValues, range?.min ?? Infinity);
  const maxY = Math.max(...yValues, range?.max ?? -Infinity);
  const pad = (maxY - minY || maxY || 1) * 0.2;

  // Trend & UX color: down-when-good (above range) → green; up-when-good (below range) → green; otherwise contextual.
  let trendColor = "#e8a04c"; // brand default
  let deltaText: string | null = null;
  let TrendIcon: typeof TrendingUp | null = null;
  if (data.length >= 2) {
    const latest = data[data.length - 1].value;
    const previous = data[data.length - 2].value;
    const diff = latest - previous;
    deltaText = `${diff > 0 ? "+" : ""}${diff.toFixed(2)} desde a medição anterior`;
    TrendIcon = diff > 0 ? TrendingUp : diff < 0 ? TrendingDown : Minus;
    if (range) {
      const wasAbove = previous > range.max;
      const wasBelow = previous < range.min;
      const movedTowardsRange =
        (wasAbove && diff < 0) || (wasBelow && diff > 0);
      const movedAwayFromRange =
        (wasAbove && diff > 0) || (wasBelow && diff < 0);
      if (movedTowardsRange) trendColor = "#10b981"; // green: improving
      else if (movedAwayFromRange) trendColor = "#ef4444"; // red: worsening
    }
  }

  const tone = classify(active.latest.classification);

  // Functional bands derived from reference range
  const bands = range
    ? {
        otimoMin: range.min,
        otimoMax: range.max,
        atencaoLow: range.min - (range.max - range.min) * 0.15,
        atencaoHigh: range.max + (range.max - range.min) * 0.15,
      }
    : null;

  return (
    <Card className="p-6">
      {/* Header: selector + KPIs */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2 min-w-[260px]">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Marcador
          </div>
          <Select value={selected ?? undefined} onValueChange={setSelected}>
            <SelectTrigger className="w-[280px] rounded-lg">
              <SelectValue placeholder="Selecione um marcador" />
            </SelectTrigger>
            <SelectContent className="max-h-80">
              {groups.map((g) => (
                <SelectItem key={g.name} value={g.name}>
                  {g.name}
                  <span className="ml-2 text-xs text-muted-foreground">
                    ({g.points.length}x)
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Referência: {active.latest.reference_value ?? "não informada"}
            {active.latest.marker_unit ? ` · Unidade: ${active.latest.marker_unit}` : ""}
          </p>
        </div>

        <div className="text-right">
          <div className="text-3xl font-semibold">
            {active.latest.marker_value_raw ?? active.latest.marker_value}
            <span className="text-sm font-normal text-muted-foreground ml-1">
              {active.latest.marker_unit ?? ""}
            </span>
          </div>
          <Badge variant="outline" className={cn("mt-1 capitalize", toneClass[tone])}>
            {active.latest.classification ?? "—"}
          </Badge>
          {deltaText && TrendIcon && (
            <div
              className="mt-1 text-xs inline-flex items-center gap-1"
              style={{ color: trendColor }}
            >
              <TrendIcon className="h-3 w-3" />
              {deltaText}
            </div>
          )}
        </div>
      </div>

      {/* Chart */}
      <div className="mt-6 h-80">
        {data.length === 0 ? (
          <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
            Este marcador não possui valores numéricos para plotar.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 16, right: 24, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="#94a3b8" />
              <YAxis
                domain={[Math.floor(minY - pad), Math.ceil(maxY + pad)]}
                tick={{ fontSize: 12 }}
                stroke="#94a3b8"
              />
              {bands && (
                <>
                  {/* Faixa Crítico (extrema baixa) */}
                  <ReferenceArea
                    y1={Math.floor(minY - pad)}
                    y2={bands.atencaoLow}
                    fill="#ef4444"
                    fillOpacity={0.05}
                  />
                  {/* Faixa Atenção baixa */}
                  <ReferenceArea
                    y1={bands.atencaoLow}
                    y2={bands.otimoMin}
                    fill="#f59e0b"
                    fillOpacity={0.06}
                  />
                  {/* Faixa Ótimo */}
                  <ReferenceArea
                    y1={bands.otimoMin}
                    y2={bands.otimoMax}
                    fill="#10b981"
                    fillOpacity={0.1}
                    stroke="#10b981"
                    strokeOpacity={0.25}
                  />
                  {/* Faixa Atenção alta */}
                  <ReferenceArea
                    y1={bands.otimoMax}
                    y2={bands.atencaoHigh}
                    fill="#f59e0b"
                    fillOpacity={0.06}
                  />
                  {/* Faixa Crítico (extrema alta) */}
                  <ReferenceArea
                    y1={bands.atencaoHigh}
                    y2={Math.ceil(maxY + pad)}
                    fill="#ef4444"
                    fillOpacity={0.05}
                  />
                  <ReferenceLine
                    y={bands.otimoMin}
                    stroke="#10b981"
                    strokeDasharray="4 4"
                    strokeOpacity={0.5}
                  />
                  <ReferenceLine
                    y={bands.otimoMax}
                    stroke="#10b981"
                    strokeDasharray="4 4"
                    strokeOpacity={0.5}
                  />
                </>
              )}
              <Tooltip
                contentStyle={{
                  borderRadius: 8,
                  border: "1px solid #e5e7eb",
                  fontSize: 12,
                }}
                formatter={(v: number) => [
                  `${v} ${active.latest.marker_unit ?? ""}`,
                  active.name,
                ]}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke={trendColor}
                strokeWidth={3}
                dot={{ r: 5, fill: trendColor, stroke: "white", strokeWidth: 2 }}
                activeDot={{ r: 7 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Legenda das faixas */}
      {bands && (
        <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500/60" /> Ótimo
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-amber-400/60" /> Atenção
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-rose-500/60" /> Crítico
          </span>
        </div>
      )}
    </Card>
  );
}

/* ---------------- COMPARATIVE TABLE ---------------- */

function ComparativeTable({
  groups,
  examDates,
}: {
  groups: { name: string; points: ResultRow[]; latest: ResultRow }[];
  examDates: string[]; // already recent → old
}) {
  if (examDates.length === 0) return null;

  return (
    <Card className="overflow-hidden">
      <div className="px-6 py-4 border-b bg-muted/30 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Tabela comparativa</h3>
          <p className="text-xs text-muted-foreground">
            Variação por marcador entre exames (mais recente à esquerda).
          </p>
        </div>
        <Badge variant="outline" className="text-[10px]">
          {examDates.length} exames · {groups.length} marcadores
        </Badge>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[180px]">Marcador</TableHead>
              {examDates.map((d) => (
                <TableHead key={d} className="whitespace-nowrap">
                  {format(new Date(d), "dd/MM/yyyy")}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.map((g) => {
              // Map measured_at -> point for fast lookup
              const byDate = new Map(g.points.map((p) => [p.measured_at, p]));
              return (
                <TableRow key={g.name}>
                  <TableCell className="font-medium">
                    <div>{g.name}</div>
                    {g.latest.reference_value && (
                      <div className="text-[10px] text-muted-foreground">
                        ref. {g.latest.reference_value}
                      </div>
                    )}
                  </TableCell>
                  {examDates.map((d, idx) => {
                    const p = byDate.get(d);
                    if (!p)
                      return (
                        <TableCell key={d} className="text-muted-foreground">
                          —
                        </TableCell>
                      );
                    // Variation vs previous (older) exam: examDates[idx + 1]
                    const olderDate = examDates[idx + 1];
                    const older = olderDate ? byDate.get(olderDate) : null;
                    let diff: number | null = null;
                    if (
                      older &&
                      older.marker_value != null &&
                      p.marker_value != null
                    ) {
                      diff = p.marker_value - older.marker_value;
                    }
                    const tone = classify(p.classification);
                    return (
                      <TableCell key={d}>
                        <div className="flex items-center gap-2">
                          <span className="font-medium tabular-nums">
                            {p.marker_value_raw ?? p.marker_value}
                            {p.marker_unit ? (
                              <span className="text-muted-foreground text-xs ml-0.5">
                                {p.marker_unit}
                              </span>
                            ) : null}
                          </span>
                          <Badge
                            variant="outline"
                            className={cn("text-[9px] px-1.5 py-0 uppercase", toneClass[tone])}
                          >
                            {p.classification ?? "—"}
                          </Badge>
                          {diff !== null && Math.abs(diff) > 1e-9 && (
                            <span
                              className={cn(
                                "inline-flex items-center text-[10px]",
                                diff > 0 ? "text-rose-600" : "text-emerald-600",
                              )}
                            >
                              {diff > 0 ? (
                                <TrendingUp className="h-3 w-3" />
                              ) : (
                                <TrendingDown className="h-3 w-3" />
                              )}
                              {diff > 0 ? "+" : ""}
                              {diff.toFixed(2)}
                            </span>
                          )}
                        </div>
                      </TableCell>
                    );
                  })}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
