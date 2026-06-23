import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ChevronRight,
  ChevronLeft,
  MessageSquare,
  Search,
  ExternalLink,
  Download,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/admin/feedbacks")({
  component: FeedbacksPage,
});

type FilterMode = "all" | "positive" | "negative" | "suggestion";

interface FeedbackRow {
  id: string;
  created_at: string;
  rating: "positive" | "negative" | "suggestion";
  comment: string | null;
  message_id: string;
  chat_id: string | null;
  patient_id: string | null;
  patient_name: string | null;
  nutri_name: string | null;
  nutri_email: string | null;
}

const HOVER_BG = "oklch(0.97 0.006 285)";

function FeedbacksPage() {
  const { role } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<FeedbackRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterMode>("all");
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (role && role !== "super_admin") {
      navigate({ to: "/app/dashboard", replace: true });
    }
  }, [role, navigate]);

  useEffect(() => {
    if (role !== "super_admin") return;
    (async () => {
      setLoading(true);
      const { data: feedbacks, error } = await (supabase as any)
        .from("ai_feedback")
        .select("id, created_at, rating, comment, message_id, created_by")
        .order("created_at", { ascending: false });

      if (error) {
        toast.error(error.message);
        setLoading(false);
        return;
      }

      const messageIds = Array.from(
        new Set((feedbacks ?? []).map((f: any) => f.message_id).filter(Boolean)),
      );

      const messagesRes = messageIds.length
        ? await (supabase as any)
            .from("chat_messages")
            .select("id, chat_id")
            .in("id", messageIds)
        : { data: [], error: null };

      const messageMap = new Map<string, string>();
      (messagesRes.data ?? []).forEach((m: any) => messageMap.set(m.id, m.chat_id));

      const chatIds = Array.from(new Set(Array.from(messageMap.values()).filter(Boolean)));
      const chatsRes = chatIds.length
        ? await (supabase as any)
            .from("patient_chats")
            .select("id, patient_id, created_by")
            .in("id", chatIds)
        : { data: [], error: null };

      const chatMap = new Map<string, { patient_id: string; created_by: string }>();
      (chatsRes.data ?? []).forEach((c: any) =>
        chatMap.set(c.id, { patient_id: c.patient_id, created_by: c.created_by }),
      );

      const patientIds = Array.from(
        new Set(Array.from(chatMap.values()).map((c) => c.patient_id).filter(Boolean)),
      );
      const nutriIds = Array.from(
        new Set([
          ...Array.from(chatMap.values()).map((c) => c.created_by),
          ...((feedbacks ?? []).map((f: any) => f.created_by) as string[]),
        ].filter(Boolean)),
      );

      const [patientsRes, profilesRes] = await Promise.all([
        patientIds.length
          ? (supabase as any).from("patients").select("id, name").in("id", patientIds)
          : Promise.resolve({ data: [] }),
        nutriIds.length
          ? (supabase as any)
              .from("profiles")
              .select("id, full_name, email")
              .in("id", nutriIds)
          : Promise.resolve({ data: [] }),
      ]);

      const patientMap = new Map<string, string>();
      (patientsRes.data ?? []).forEach((p: any) => patientMap.set(p.id, p.name));
      const profileMap = new Map<string, { full_name: string | null; email: string }>();
      (profilesRes.data ?? []).forEach((p: any) =>
        profileMap.set(p.id, { full_name: p.full_name, email: p.email }),
      );

      const merged: FeedbackRow[] = (feedbacks ?? []).map((f: any) => {
        const chatId = messageMap.get(f.message_id) ?? null;
        const chatInfo = chatId ? chatMap.get(chatId) : undefined;
        const patientId = chatInfo?.patient_id ?? null;
        const nutriId = chatInfo?.created_by ?? f.created_by;
        const profile = nutriId ? profileMap.get(nutriId) : undefined;
        return {
          id: f.id,
          created_at: f.created_at,
          rating: f.rating,
          comment: f.comment,
          message_id: f.message_id,
          chat_id: chatId,
          patient_id: patientId,
          patient_name: patientId ? patientMap.get(patientId) ?? null : null,
          nutri_name: profile?.full_name ?? null,
          nutri_email: profile?.email ?? null,
        };
      });

      setRows(merged);
      setLoading(false);
    })();
  }, [role]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter !== "all" && r.rating !== filter) return false;
      if (!q) return true;
      return (
        (r.patient_name ?? "").toLowerCase().includes(q) ||
        (r.nutri_name ?? "").toLowerCase().includes(q) ||
        (r.nutri_email ?? "").toLowerCase().includes(q) ||
        (r.comment ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, search, filter]);

  // Reset page on filter/search change
  useEffect(() => {
    setPage(1);
  }, [search, filter, pageSize]);

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, totalPages);
  const startIdx = (currentPage - 1) * pageSize;
  const paged = filtered.slice(startIdx, startIdx + pageSize);

  // Group paged rows by date
  const groups = useMemo(() => {
    const map = new Map<string, FeedbackRow[]>();
    for (const r of paged) {
      const d = new Date(r.created_at);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return Array.from(map.entries()).map(([key, items]) => ({
      key,
      date: new Date(items[0].created_at),
      items,
    }));
  }, [paged]);

  const stats = useMemo(() => {
    const total = rows.length;
    const positive = rows.filter((r) => r.rating === "positive").length;
    const negative = rows.filter((r) => r.rating === "negative").length;
    const suggestion = rows.filter((r) => r.rating === "suggestion").length;
    const ratable = positive + negative;
    const approval = ratable > 0 ? Math.round((positive / ratable) * 100) : 0;

    // MoM variations
    const now = new Date();
    const startThis = new Date(now.getFullYear(), now.getMonth(), 1);
    const startPrev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const inRange = (d: Date, from: Date, to: Date) => d >= from && d < to;
    const prev = {
      total: 0,
      positive: 0,
      negative: 0,
      suggestion: 0,
    };
    const curr = { total: 0, positive: 0, negative: 0, suggestion: 0 };
    for (const r of rows) {
      const d = new Date(r.created_at);
      if (inRange(d, startThis, new Date(now.getFullYear(), now.getMonth() + 1, 1))) {
        curr.total++;
        (curr as any)[r.rating]++;
      } else if (inRange(d, startPrev, startThis)) {
        prev.total++;
        (prev as any)[r.rating]++;
      }
    }
    const prevRatable = prev.positive + prev.negative;
    const prevApproval = prevRatable > 0 ? Math.round((prev.positive / prevRatable) * 100) : 0;

    return {
      total,
      positive,
      negative,
      suggestion,
      approval,
      deltaTotal: curr.total - prev.total,
      deltaApproval: approval - prevApproval,
      deltaNegative: curr.negative - prev.negative,
      deltaSuggestion: curr.suggestion - prev.suggestion,
    };
  }, [rows]);

  const exportCsv = () => {
    const headers = ["Data", "Paciente", "Nutricionista", "Rating", "Comentário"];
    const escape = (v: string) => `"${(v ?? "").replace(/"/g, '""')}"`;
    const lines = [headers.join(",")];
    for (const r of filtered) {
      lines.push(
        [
          new Date(r.created_at).toLocaleString("pt-BR"),
          r.patient_name ?? "",
          r.nutri_name ?? r.nutri_email ?? "",
          r.rating,
          (r.comment ?? "").replace(/\n/g, " "),
        ]
          .map(escape)
          .join(","),
      );
    }
    const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `feedbacks-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (role && role !== "super_admin") return null;

  return (
    <div className="space-y-10 max-w-6xl">
      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
        <span>Operação</span>
        <ChevronRight className="h-3 w-3" />
        <span className="text-foreground/80">Auditoria de Feedbacks</span>
      </div>

      <div className="space-y-4">
        <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
          Painel administrativo
        </p>
        <h1 className="font-serif text-5xl md:text-6xl font-normal leading-[1.05] tracking-tight text-foreground">
          Auditoria de{" "}
          <span className="italic text-gradient-brand">feedbacks</span>
        </h1>
        <p className="max-w-2xl text-base text-muted-foreground leading-relaxed">
          Acompanhe as avaliações que os nutricionistas dão às respostas da
          Lumma. Use os filtros para identificar padrões e refinar os prompts
          do Dify.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <StatTile label="Total" value={stats.total} delta={stats.deltaTotal} />
        <StatTile
          label="Taxa de aprovação"
          value={`${stats.approval}%`}
          delta={stats.deltaApproval}
          deltaSuffix="pp"
        />
        <StatTile label="Negativos" value={stats.negative} delta={stats.deltaNegative} />
        <StatTile label="Sugestões" value={stats.suggestion} delta={stats.deltaSuggestion} />
      </div>

      <Card className="rounded-2xl border bg-card shadow-sm">
        <CardHeader className="flex-row items-center justify-between gap-4 border-b flex-wrap">
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              Operação
            </p>
            <CardTitle className="text-lg font-serif font-normal mt-1">
              Histórico de feedbacks
            </CardTitle>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1 rounded-full bg-muted/60 p-1">
              {(
                [
                  { key: "all", label: "Todos" },
                  { key: "negative", label: "Negativos" },
                  { key: "positive", label: "Positivos" },
                  { key: "suggestion", label: "Sugestões" },
                ] as { key: FilterMode; label: string }[]
              ).map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFilter(f.key)}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
                    filter === f.key
                      ? "bg-white shadow-sm text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div className="relative w-64 max-w-full">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar paciente, nutri ou texto..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 rounded-xl"
              />
            </div>
            <Button variant="outline" size="sm" onClick={exportCsv}>
              <Download className="h-3.5 w-3.5 mr-1.5" />
              Exportar CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          {loading ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              Carregando...
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center">
              <div className="h-12 w-12 mx-auto rounded-2xl bg-accent/60 flex items-center justify-center mb-4">
                <MessageSquare className="h-6 w-6 text-accent-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">
                Nenhum feedback encontrado.
              </p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground w-[120px]">
                      Hora
                    </TableHead>
                    <TableHead className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                      Paciente / Nutri
                    </TableHead>
                    <TableHead className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                      Rating
                    </TableHead>
                    <TableHead className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                      Comentário
                    </TableHead>
                    <TableHead className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground text-right">
                      Conversa
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groups.map((g) => (
                    <>
                      <TableRow key={`h-${g.key}`} className="hover:bg-transparent border-0">
                        <TableCell colSpan={5} className="pt-6 pb-2">
                          <div className="flex items-center gap-3">
                            <span className="text-xs uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                              {g.date.toLocaleDateString("pt-BR", {
                                weekday: "long",
                                day: "numeric",
                                month: "long",
                              })}
                            </span>
                            <div className="flex-1 h-px bg-border" />
                          </div>
                        </TableCell>
                      </TableRow>
                      {g.items.map((r) => (
                        <TableRow
                          key={r.id}
                          className="border-b last:border-0 align-top transition-colors"
                          style={{ transition: "background 120ms ease" }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = HOVER_BG)}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "")}
                        >
                          <TableCell className="py-4 font-mono text-sm text-muted-foreground whitespace-nowrap">
                            {new Date(r.created_at).toLocaleTimeString("pt-BR", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </TableCell>
                          <TableCell className="py-4">
                            <div className="font-medium text-foreground">
                              {r.patient_name ?? "—"}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {r.nutri_name ?? r.nutri_email ?? "—"}
                            </div>
                          </TableCell>
                          <TableCell className="py-4">
                            <RatingBadge rating={r.rating} />
                          </TableCell>
                          <TableCell className="py-4 text-sm text-foreground/80 max-w-md">
                            {r.comment ? (
                              <span className="line-clamp-3 whitespace-pre-wrap">
                                {r.comment}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="py-4 text-right">
                            {r.patient_id ? (
                              <Button
                                asChild
                                variant="outline"
                                size="sm"
                                className="rounded-full"
                              >
                                <Link
                                  to="/app/chat/$patientId"
                                  params={{ patientId: r.patient_id }}
                                  search={{
                                    chatId: r.chat_id ?? undefined,
                                    messageId: r.message_id,
                                  }}
                                >
                                  <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                                  Ver conversa
                                </Link>
                              </Button>
                            ) : (
                              <UnavailableBadge />
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </>
                  ))}
                </TableBody>
              </Table>

              {/* Pagination */}
              <div className="mt-2 flex flex-col gap-3 border-t py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>Exibir:</span>
                  <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
                    <SelectTrigger className="h-8 w-[72px] rounded-md text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[10, 25, 50].map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          {n}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="text-xs text-muted-foreground text-center">
                  Exibindo {total === 0 ? 0 : startIdx + 1}–
                  {Math.min(startIdx + pageSize, total)} de {total} feedbacks
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    disabled={currentPage <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    aria-label="Página anterior"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  {Array.from({ length: totalPages })
                    .slice(
                      Math.max(0, currentPage - 3),
                      Math.max(0, currentPage - 3) + Math.min(5, totalPages),
                    )
                    .map((_, i) => {
                      const start = Math.max(0, currentPage - 3);
                      const num = start + i + 1;
                      if (num > totalPages) return null;
                      const active = num === currentPage;
                      return (
                        <button
                          key={num}
                          type="button"
                          onClick={() => setPage(num)}
                          className={cn(
                            "h-8 min-w-8 rounded-md px-2 text-xs font-medium transition-colors",
                            active
                              ? "bg-primary/10 text-foreground border border-primary"
                              : "text-muted-foreground hover:bg-muted/50",
                          )}
                        >
                          {num}
                        </button>
                      );
                    })}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    disabled={currentPage >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    aria-label="Próxima página"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatTile({
  label,
  value,
  delta,
  deltaSuffix,
}: {
  label: string;
  value: number | string;
  delta?: number;
  deltaSuffix?: string;
}) {
  const hasDelta = typeof delta === "number";
  const arrow = !hasDelta ? "" : delta! > 0 ? "↑" : delta! < 0 ? "↓" : "→";
  const abs = hasDelta ? Math.abs(delta!) : 0;
  return (
    <div className="rounded-2xl border bg-card shadow-sm" style={{ padding: 24 }}>
      <p className="text-xs uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="font-mono font-bold text-4xl tracking-tight text-foreground mt-2">
        {value}
      </p>
      {hasDelta && (
        <p className="text-xs text-muted-foreground mt-2">
          {arrow} {abs}
          {deltaSuffix ? deltaSuffix : ""} vs mês anterior
        </p>
      )}
    </div>
  );
}

const BADGE_BASE: React.CSSProperties = {
  display: "inline-block",
  fontSize: 11,
  fontWeight: 500,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  borderRadius: 4,
  padding: "2px 8px",
  borderWidth: 1,
  borderStyle: "solid",
};

function RatingBadge({ rating }: { rating: FeedbackRow["rating"] }) {
  const map = {
    positive: {
      bg: "oklch(0.96 0.04 160)",
      border: "oklch(0.7 0.12 160)",
      text: "oklch(0.4 0.12 160)",
      label: "Positivo",
    },
    negative: {
      bg: "oklch(0.97 0.04 28)",
      border: "oklch(0.7 0.15 28)",
      text: "oklch(0.45 0.15 28)",
      label: "Negativo",
    },
    suggestion: {
      bg: "oklch(0.96 0.04 250)",
      border: "oklch(0.7 0.10 250)",
      text: "oklch(0.4 0.10 250)",
      label: "Sugestão",
    },
  }[rating];
  return (
    <span
      style={{
        ...BADGE_BASE,
        background: map.bg,
        borderColor: map.border,
        color: map.text,
      }}
    >
      {map.label}
    </span>
  );
}

function UnavailableBadge() {
  return (
    <span
      style={{
        ...BADGE_BASE,
        background: "oklch(0.95 0.005 285)",
        borderColor: "oklch(0.9 0.005 285)",
        color: "oklch(0.6 0.01 285)",
      }}
    >
      Indisponível
    </span>
  );
}
