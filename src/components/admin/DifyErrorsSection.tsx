import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Copy, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  listDifyErrors,
  getDifyErrorStats,
  exportDifyErrors,
} from "@/lib/dify-errors-admin.functions";


/** Rótulos em pt-BR para as famílias de erro registradas. */
const KIND_LABEL: Record<string, string> = {
  timeout: "Tempo esgotado",
  connection: "Falha de conexão",
  upstream_error: "Erro do Dify",
  rate_limit: "Limite de envios",
  high_demand: "Alta demanda",
  file_read: "Falha ao ler arquivo",
  task_routing: "Tarefa não reconhecida",
  content_error: "Erro dentro da resposta",
  empty_answer: "Resposta vazia",
  suspicious_fast: "Resposta rápida demais",
  no_execution: "Execução inexistente",
  missing_markers: "Sem marcadores na resposta",
  unknown: "Não classificado",
};


const PERIODS = [
  { label: "24 horas", hours: 24 },
  { label: "7 dias", hours: 24 * 7 },
  { label: "30 dias", hours: 24 * 30 },
  { label: "90 dias", hours: 24 * 90 },
];

const ALL = "__all__";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "medium" });
}

function fmtDuration(ms: number | null) {
  if (ms == null) return "—";
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

/** Barra horizontal simples para leitura de padrão. */
function Bars({ data, max }: { data: Array<{ key: string; count: number }>; max?: number }) {
  const top = data.slice(0, max ?? 8);
  const peak = Math.max(1, ...top.map((d) => d.count));
  if (top.length === 0) return <p className="text-sm text-muted-foreground">Sem dados no período.</p>;
  return (
    <div className="space-y-2">
      {top.map((d) => (
        <div key={d.key} className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="truncate text-foreground">{KIND_LABEL[d.key] ?? d.key}</span>
            <span className="text-muted-foreground">{d.count}</span>
          </div>
          <div className="h-2 rounded-full bg-muted">
            <div
              className="h-2 rounded-full bg-gradient-to-r from-[#e8a04c] to-[#e89bcf]"
              style={{ width: `${(d.count / peak) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function DifyErrorsSection() {
  const [hours, setHours] = useState(24 * 7);
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [profile, setProfile] = useState(ALL);
  const [task, setTask] = useState(ALL);
  const [kind, setKind] = useState(ALL);
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<any | null>(null);

  const listFn = useServerFn(listDifyErrors);
  const statsFn = useServerFn(getDifyErrorStats);
  const exportFn = useServerFn(exportDifyErrors);
  const [exporting, setExporting] = useState(false);

  /** Baixa o CSV do período/filtros atuais, com message_id e conversation_id. */
  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await exportFn({ data: filters });
      const url = URL.createObjectURL(new Blob([res.csv], { type: "text/csv;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `erros-ia-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exportação concluída: ${res.rows} ocorrências.`);
    } catch {
      toast.error("Não foi possível exportar agora. Tente novamente.");
    } finally {
      setExporting(false);
    }
  };


  const filters = {
    hours,
    q: search,
    profile: profile === ALL ? "" : profile,
    task: task === ALL ? "" : task,
    kind: kind === ALL ? "" : kind,
  };

  const listQuery = useQuery({
    queryKey: ["dify-errors", filters, page],
    queryFn: () => listFn({ data: { ...filters, page, pageSize: 25 } }),
  });

  const statsQuery = useQuery({
    queryKey: ["dify-errors-stats", filters],
    queryFn: () => statsFn({ data: filters }),
  });

  const stats = statsQuery.data;
  const rows = listQuery.data?.rows ?? [];
  const total = listQuery.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / 25));

  const resetPage = () => setPage(1);

  return (
    <div className="space-y-6">
      {/* Filtros */}
      <Card className="rounded-lg">
        <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
          <div className="flex flex-wrap gap-2">
            {PERIODS.map((p) => (
              <Button
                key={p.hours}
                size="sm"
                variant={hours === p.hours ? "default" : "outline"}
                onClick={() => {
                  setHours(p.hours);
                  resetPage();
                }}
              >
                {p.label}
              </Button>
            ))}
          </div>

          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              placeholder="Buscar no erro, conversa ou arquivo…"
              className="pl-9"
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setSearch(q.trim());
                  resetPage();
                }
              }}
            />
          </div>

          <Select
            value={profile}
            onValueChange={(v) => {
              setProfile(v);
              resetPage();
            }}
          >
            <SelectTrigger className="w-full lg:w-44">
              <SelectValue placeholder="Perfil" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos os perfis</SelectItem>
              {(stats?.profiles ?? []).map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={task}
            onValueChange={(v) => {
              setTask(v);
              resetPage();
            }}
          >
            <SelectTrigger className="w-full lg:w-48">
              <SelectValue placeholder="Tarefa" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas as tarefas</SelectItem>
              {(stats?.tasks ?? []).map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={kind}
            onValueChange={(v) => {
              setKind(v);
              resetPage();
            }}
          >
            <SelectTrigger className="w-full lg:w-52">
              <SelectValue placeholder="Tipo de erro" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos os tipos</SelectItem>
              {(stats?.kinds ?? []).map((k) => (
                <SelectItem key={k} value={k}>
                  {KIND_LABEL[k] ?? k}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Padrões */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="rounded-lg">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Tipo de erro</CardTitle>
          </CardHeader>
          <CardContent>
            {statsQuery.isLoading ? <Skeleton className="h-24 w-full" /> : <Bars data={stats?.byKind ?? []} />}
          </CardContent>
        </Card>

        <Card className="rounded-lg">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Duração até falhar</CardTitle>
          </CardHeader>
          <CardContent>
            {statsQuery.isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : (
              <Bars data={stats?.byDuration ?? []} />
            )}
          </CardContent>
        </Card>

        <Card className="rounded-lg">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Perfil e tarefa</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {statsQuery.isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : (
              <>
                <Bars data={stats?.byProfile ?? []} max={3} />
                <Bars data={stats?.byTask ?? []} max={3} />
              </>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-lg">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Horário (UTC) e arquivo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {statsQuery.isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : (
              <>
                <Bars
                  data={(stats?.byHour ?? [])
                    .filter((h) => h.count > 0)
                    .sort((a, b) => b.count - a.count)
                    .map((h) => ({ key: `${String(h.hour).padStart(2, "0")}h`, count: h.count }))}
                  max={4}
                />
                <Bars data={stats?.byMime ?? []} max={3} />
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Lista */}
      <Card className="rounded-lg">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4 text-[#e8a04c]" />
            Ocorrências
            <Badge variant="secondary">{total}</Badge>
          </CardTitle>
          <div className="flex items-center gap-2">
            {listQuery.isFetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            <Button size="sm" variant="outline" disabled={exporting} onClick={handleExport}>
              {exporting ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : null}
              Exportar CSV
            </Button>
          </div>

        </CardHeader>
        <CardContent className="space-y-2">
          {listQuery.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={`sk-${i}`} className="h-16 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhuma ocorrência registrada com esses filtros.
            </p>
          ) : (
            rows.map((r: any) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setDetail(r)}
                className="w-full rounded-lg border border-border bg-card p-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{KIND_LABEL[r.error_kind] ?? r.error_kind}</Badge>
                  <span className="text-xs text-muted-foreground">{fmtDate(r.created_at)}</span>
                  <span className="text-xs text-muted-foreground">· {fmtDuration(r.duration_ms)}</span>
                  {r.selected_task && <Badge variant="secondary">{r.selected_task}</Badge>}
                  {r.patient_profile && <Badge variant="secondary">{r.patient_profile}</Badge>}
                  {r.had_attachment && <Badge variant="secondary">anexo</Badge>}
                  {r.was_retry && <Badge variant="secondary">retentativa</Badge>}
                </div>
                <p className="mt-1 truncate text-sm text-foreground">
                  {r.user?.full_name || r.user?.email || "Usuária não identificada"}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {r.raw_error || (r.metadata?.note ?? "Sem erro bruto registrado.")}
                </p>
              </button>
            ))
          )}

          {pages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-muted-foreground">
                Página {page} de {pages}
              </span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Anterior
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page >= pages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Próxima
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detalhe com erro bruto */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalhe da ocorrência</DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-4 text-sm">
              <div className="grid gap-2 sm:grid-cols-2">
                <p>
                  <span className="text-muted-foreground">Quando:</span> {fmtDate(detail.created_at)}
                </p>
                <p>
                  <span className="text-muted-foreground">Duração:</span> {fmtDuration(detail.duration_ms)}
                </p>
                <p>
                  <span className="text-muted-foreground">Usuária:</span>{" "}
                  {detail.user?.full_name || detail.user?.email || "—"}
                </p>
                <p>
                  <span className="text-muted-foreground">Tipo:</span>{" "}
                  {KIND_LABEL[detail.error_kind] ?? detail.error_kind}
                </p>
                <p>
                  <span className="text-muted-foreground">Perfil:</span> {detail.patient_profile ?? "—"}
                </p>
                <p>
                  <span className="text-muted-foreground">Tarefa:</span> {detail.selected_task ?? "—"}
                </p>
                <p>
                  <span className="text-muted-foreground">Conversa:</span> {detail.conversation_id ?? "—"}
                </p>
                <p>
                  <span className="text-muted-foreground">HTTP:</span> {detail.http_status ?? "—"}
                </p>
                <p>
                  <span className="text-muted-foreground">Anexo:</span>{" "}
                  {detail.attachment_name || (detail.had_attachment ? "sim" : "não")}
                  {detail.attachment_mime ? ` (${detail.attachment_mime})` : ""}
                </p>
                <p>
                  <span className="text-muted-foreground">Crédito debitado:</span>{" "}
                  {detail.billed ? "sim" : "não"}
                </p>
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-muted-foreground">Erro bruto do Dify</span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      navigator.clipboard.writeText(detail.raw_error ?? "");
                      toast.success("Erro bruto copiado.");
                    }}
                  >
                    <Copy className="mr-2 h-3 w-3" /> Copiar
                  </Button>
                </div>
                <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-muted p-3 text-xs">
                  {detail.raw_error || "Sem erro bruto — ocorrência detectada por duração/resposta vazia."}
                </pre>
              </div>

              {detail.metadata && Object.keys(detail.metadata).length > 0 && (
                <div>
                  <span className="text-muted-foreground">Contexto</span>
                  <pre className="mt-1 overflow-auto rounded-lg bg-muted p-3 text-xs">
                    {JSON.stringify(detail.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
