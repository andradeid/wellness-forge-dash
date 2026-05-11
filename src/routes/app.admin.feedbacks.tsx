import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ChevronRight,
  MessageSquare,
  ThumbsDown,
  ThumbsUp,
  Search,
  ExternalLink,
  Lightbulb,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

function FeedbacksPage() {
  const { role } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<FeedbackRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterMode>("all");

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

  const stats = useMemo(() => {
    const total = rows.length;
    const positive = rows.filter((r) => r.rating === "positive").length;
    const negative = rows.filter((r) => r.rating === "negative").length;
    const suggestion = rows.filter((r) => r.rating === "suggestion").length;
    const ratable = positive + negative;
    const approval = ratable > 0 ? Math.round((positive / ratable) * 100) : 0;
    return { total, positive, negative, suggestion, approval };
  }, [rows]);

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
        <StatTile label="Total" value={stats.total} icon={MessageSquare} />
        <StatTile
          label="Taxa de aprovação"
          value={`${stats.approval}%`}
          icon={ThumbsUp}
          accent="emerald"
        />
        <StatTile
          label="Negativos"
          value={stats.negative}
          icon={ThumbsDown}
          accent="rose"
        />
        <StatTile
          label="Sugestões"
          value={stats.suggestion}
          icon={Lightbulb}
          accent="sky"
        />
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
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                    Data
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
                {filtered.map((r) => (
                  <TableRow
                    key={r.id}
                    className={cn(
                      "border-b last:border-0 align-top",
                      r.rating === "negative" && "bg-rose-50/60 hover:bg-rose-50",
                    )}
                  >
                    <TableCell className="py-4 text-sm text-muted-foreground whitespace-nowrap">
                      {new Date(r.created_at).toLocaleString("pt-BR", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
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
                            search={{ chatId: r.chat_id ?? undefined, messageId: r.message_id }}
                          >
                            <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                            Ver conversa
                          </Link>
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          indisponível
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatTile({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: number | string;
  icon: React.ComponentType<{ className?: string }>;
  accent?: "emerald" | "rose" | "sky";
}) {
  const tone =
    accent === "emerald"
      ? "bg-emerald-100 text-emerald-700"
      : accent === "rose"
        ? "bg-rose-100 text-rose-700"
        : accent === "sky"
          ? "bg-sky-100 text-sky-700"
          : "bg-accent/60 text-accent-foreground";
  return (
    <div className="rounded-2xl border bg-card p-5 shadow-sm flex items-center gap-4">
      <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center", tone)}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
          {label}
        </p>
        <p className="text-2xl font-semibold text-foreground">{value}</p>
      </div>
    </div>
  );
}

function RatingBadge({ rating }: { rating: FeedbackRow["rating"] }) {
  if (rating === "positive") {
    return (
      <Badge className="rounded-full gap-1.5 bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-0">
        <ThumbsUp className="h-3 w-3" />
        Positivo
      </Badge>
    );
  }
  if (rating === "negative") {
    return (
      <Badge className="rounded-full gap-1.5 bg-rose-100 text-rose-700 hover:bg-rose-100 border-0">
        <ThumbsDown className="h-3 w-3" />
        Negativo
      </Badge>
    );
  }
  return (
    <Badge className="rounded-full gap-1.5 bg-sky-100 text-sky-700 hover:bg-sky-100 border-0">
      <MessageSquare className="h-3 w-3" />
      Sugestão
    </Badge>
  );
}
