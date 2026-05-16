import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { MessageSquare, Search, Clock, FileText, Pin, PinOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/chats")({
  component: ChatsCentralPage,
});

interface ChatRow {
  id: string;
  patient_id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
  pinned_at: string | null;
  patient: { id: string; name: string; avatar_url: string | null } | null;
  last_message: { content: string; role: string; created_at: string } | null;
  message_count: number;
  exam_count: number;
}

function ChatsCentralPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<ChatRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const { data: chats } = await (supabase as any)
        .from("patient_chats")
        .select("id, patient_id, title, created_at, updated_at, pinned_at, patients:patient_id(id, name, avatar_url)")
        .eq("created_by", user.id)
        .order("pinned_at", { ascending: false, nullsFirst: false })
        .order("updated_at", { ascending: false })
        .limit(200);

      const chatIds = (chats ?? []).map((c: any) => c.id);
      let msgsByChat: Record<string, any[]> = {};
      let examsByChat: Record<string, number> = {};

      if (chatIds.length > 0) {
        const { data: msgs } = await (supabase as any)
          .from("chat_messages")
          .select("chat_id, content, role, created_at")
          .in("chat_id", chatIds)
          .order("created_at", { ascending: false });
        for (const m of msgs ?? []) {
          (msgsByChat[m.chat_id] ||= []).push(m);
        }

        const { data: exams } = await (supabase as any)
          .from("patient_exams")
          .select("chat_id")
          .in("chat_id", chatIds);
        for (const e of exams ?? []) {
          examsByChat[e.chat_id] = (examsByChat[e.chat_id] ?? 0) + 1;
        }
      }

      const mapped: ChatRow[] = (chats ?? []).map((c: any) => {
        const ms = msgsByChat[c.id] ?? [];
        return {
          id: c.id,
          patient_id: c.patient_id,
          title: c.title,
          created_at: c.created_at,
          updated_at: c.updated_at,
          pinned_at: c.pinned_at ?? null,
          patient: c.patients ?? null,
          last_message: ms[0]
            ? { content: ms[0].content ?? "", role: ms[0].role, created_at: ms[0].created_at }
            : null,
          message_count: ms.length,
          exam_count: examsByChat[c.id] ?? 0,
        };
      });

      setRows(mapped);
      setLoading(false);
    })();
  }, [user]);

  const togglePin = async (e: React.MouseEvent, chat: ChatRow) => {
    e.preventDefault();
    e.stopPropagation();
    const next = chat.pinned_at ? null : new Date().toISOString();
    setRows((rs) =>
      [...rs.map((r) => (r.id === chat.id ? { ...r, pinned_at: next } : r))].sort(sortRows),
    );
    const { error } = await (supabase as any)
      .from("patient_chats")
      .update({ pinned_at: next })
      .eq("id", chat.id);
    if (error) {
      toast.error("Não foi possível atualizar a fixação.");
      setRows((rs) =>
        [...rs.map((r) => (r.id === chat.id ? { ...r, pinned_at: chat.pinned_at } : r))].sort(sortRows),
      );
    } else {
      toast.success(next ? "Conversa fixada no topo." : "Conversa desafixada.");
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.patient?.name?.toLowerCase().includes(q) ||
        r.last_message?.content?.toLowerCase().includes(q),
    );
  }, [rows, search]);

  const stats = useMemo(() => {
    const total = rows.length;
    const last7 = rows.filter((r) => {
      const d = new Date(r.updated_at).getTime();
      return Date.now() - d < 7 * 24 * 60 * 60 * 1000;
    }).length;
    const withExams = rows.filter((r) => r.exam_count > 0).length;
    const totalMessages = rows.reduce((a, r) => a + r.message_count, 0);
    return { total, last7, withExams, totalMessages };
  }, [rows]);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Central de Conversas</h1>
        <p className="text-sm text-muted-foreground">
          Acompanhe todas as sessões de chat com seus pacientes em um só lugar.
        </p>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Conversas" value={stats.total} />
        <StatCard label="Ativas (7 dias)" value={stats.last7} />
        <StatCard label="Com exames" value={stats.withExams} />
        <StatCard label="Mensagens" value={stats.totalMessages} />
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por paciente ou conteúdo..."
          className="pl-9"
        />
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="p-10 text-center">
          <MessageSquare className="h-10 w-10 mx-auto text-muted-foreground/60 mb-3" />
          <p className="text-sm text-muted-foreground">
            {rows.length === 0
              ? "Nenhuma conversa ainda. Inicie uma consulta em Pacientes."
              : "Nenhuma conversa corresponde à busca."}
          </p>
        </Card>
      ) : (
        <ul className="space-y-2">
          {filtered.map((r) => (
            <li key={r.id}>
              <Link
                to="/app/chat/$patientId"
                params={{ patientId: r.patient_id }}
                className="block"
              >
                <Card className={cn("p-4 hover:bg-accent/40 transition-colors", r.pinned_at && "border-amber-300 bg-amber-50/40")}>
                  <div className="flex items-start gap-4">
                    <Avatar className="h-11 w-11 shrink-0">
                      <AvatarImage src={r.patient?.avatar_url ?? undefined} />
                      <AvatarFallback className="bg-gradient-brand text-white text-xs font-semibold">
                        {(r.patient?.name || "??").slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {r.pinned_at && <Pin className="h-3.5 w-3.5 text-amber-600 fill-amber-500" />}
                        <span className="font-medium truncate">
                          {r.patient?.name ?? "Paciente removido"}
                        </span>
                        <StatusBadge updatedAt={r.updated_at} />
                        {r.exam_count > 0 && (
                          <Badge variant="secondary" className="gap-1">
                            <FileText className="h-3 w-3" />
                            {r.exam_count} exame{r.exam_count > 1 ? "s" : ""}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground truncate mt-1">
                        {r.last_message ? (
                          <>
                            <span className="font-medium">
                              {r.last_message.role === "user" ? "Você: " : "Lumma: "}
                            </span>
                            {preview(r.last_message.content)}
                          </>
                        ) : (
                          <span className="italic">Sem mensagens</span>
                        )}
                      </p>
                    </div>
                    <div className="text-right shrink-0 text-xs text-muted-foreground flex flex-col items-end gap-1">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatWhen(r.updated_at)}
                      </span>
                      <span>{r.message_count} msgs</span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={(e) => togglePin(e, r)}
                      title={r.pinned_at ? "Desafixar conversa" : "Fixar no topo"}
                      className={cn("shrink-0", r.pinned_at && "text-amber-600")}
                    >
                      {r.pinned_at ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                    </Button>
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card className="p-4">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
    </Card>
  );
}

function StatusBadge({ updatedAt }: { updatedAt: string }) {
  const ageMs = Date.now() - new Date(updatedAt).getTime();
  const isActive = ageMs < 24 * 60 * 60 * 1000;
  return (
    <Badge
      variant="outline"
      className={cn(
        "text-[10px] uppercase tracking-wider",
        isActive
          ? "border-emerald-300 text-emerald-700 bg-emerald-50"
          : "border-slate-300 text-slate-600 bg-slate-50",
      )}
    >
      {isActive ? "Ativa" : "Concluída"}
    </Badge>
  );
}

function preview(s: string) {
  const cleaned = s.replace(/```[\s\S]*?```/g, "").replace(/\s+/g, " ").trim();
  return cleaned.length > 140 ? cleaned.slice(0, 140) + "…" : cleaned;
}

function formatWhen(iso: string) {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  const days = Math.floor(h / 24);
  if (days < 7) return `há ${days}d`;
  return d.toLocaleDateString("pt-BR");
}

function sortRows(a: ChatRow, b: ChatRow) {
  if (!!a.pinned_at !== !!b.pinned_at) return a.pinned_at ? -1 : 1;
  if (a.pinned_at && b.pinned_at) {
    return new Date(b.pinned_at).getTime() - new Date(a.pinned_at).getTime();
  }
  return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
}
