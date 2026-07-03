import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { MessageSquare, Search, Clock, FileText, Pin, PinOff, Edit2, Check, X, ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useChatHistory, type ChatItem } from "@/hooks/useChatHistory";

export const Route = createFileRoute("/app/chats")({
  component: ChatsCentralPage,
});

type ChipFilter = "all" | "active" | "done" | "exams" | "pinned";

const PINNED_STYLE: React.CSSProperties = {
  borderLeft: "3px solid #e8a04c",
  borderTop: "none",
  borderRight: "none",
  borderBottom: "none",
  backgroundColor: "oklch(0.995 0.008 65)",
};

function ChatsCentralPage() {
  const { chats: rows, loading, refresh } = useChatHistory(200);
  const [search, setSearch] = useState("");
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [isUpdatingTitle, setIsUpdatingTitle] = useState(false);
  const [chipFilter, setChipFilter] = useState<ChipFilter>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const handleUpdateTitle = async (e: React.MouseEvent | React.KeyboardEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!editTitle.trim()) return;
    setIsUpdatingTitle(true);
    try {
      const { error } = await supabase
        .from("general_chats")
        .update({ title: editTitle.trim() })
        .eq("id", id);
      
      if (error) throw error;
      toast.success("Título atualizado com sucesso.");
      await refresh();
      setEditingChatId(null);
    } catch (err) {
      console.error("Erro ao atualizar título:", err);
      toast.error("Erro ao atualizar título.");
    } finally {
      setIsUpdatingTitle(false);
    }
  };

  const togglePin = async (e: React.MouseEvent, chat: ChatItem) => {
    e.preventDefault();
    e.stopPropagation();
    const next = chat.pinned_at ? null : new Date().toISOString();
    
    const table = chat.patient_id ? "patient_chats" : "general_chats";
    const { error } = await (supabase as any)
      .from(table)
      .update({ pinned_at: next })
      .eq("id", chat.id);

    if (error) {
      toast.error("Não foi possível atualizar a fixação.");
    } else {
      toast.success(next ? "Conversa fixada no topo." : "Conversa desafixada.");
      refresh();
    }
  };

  const isActiveChat = (r: ChatItem) =>
    Date.now() - new Date(r.updated_at).getTime() < 24 * 60 * 60 * 1000;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = rows;
    if (q) {
      list = list.filter(
        (r) =>
          (r.title || r.patient_name || "").toLowerCase().includes(q) ||
          r.last_message?.content?.toLowerCase().includes(q),
      );
    }
    if (chipFilter === "active") list = list.filter(isActiveChat);
    else if (chipFilter === "done") list = list.filter((r) => !isActiveChat(r));
    else if (chipFilter === "exams") list = list.filter((r) => (r.exam_count ?? 0) > 0);
    else if (chipFilter === "pinned") list = list.filter((r) => !!r.pinned_at);
    return list;
  }, [rows, search, chipFilter]);

  useEffect(() => {
    setPage(1);
  }, [search, chipFilter, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const startIdx = (currentPage - 1) * pageSize;
  const endIdx = Math.min(startIdx + pageSize, filtered.length);
  const paginated = filtered.slice(startIdx, endIdx);

  const stats = useMemo(() => {
    const total = rows.length;
    const last7 = rows.filter((r) => {
      const d = new Date(r.updated_at).getTime();
      return Date.now() - d < 7 * 24 * 60 * 60 * 1000;
    }).length;
    const withExams = rows.filter((r) => (r.exam_count ?? 0) > 0).length;
    const totalMessages = rows.reduce((a, r) => a + (r.message_count ?? 0), 0);
    return { total, last7, withExams, totalMessages };
  }, [rows]);

  const chips: { id: ChipFilter; label: string }[] = [
    { id: "all", label: "Todas" },
    { id: "active", label: "Ativas" },
    { id: "done", label: "Concluídas" },
    { id: "exams", label: "Com exames" },
    { id: "pinned", label: "Fixadas" },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Central de Conversas</h1>
        <p className="text-sm text-muted-foreground">
          Acompanhe todas as sessões de chat com seus pacientes em um só lugar.
        </p>
      </header>

      <div
        className="flex items-start gap-3 px-4 py-3 text-sm text-amber-900"
        style={{
          backgroundColor: "oklch(0.98 0.03 85)",
          borderLeft: "3px solid #e8a04c",
          borderRadius: "8px",
        }}
      >
        <Pin className="h-4 w-4 mt-0.5 shrink-0 fill-amber-500 text-amber-600" />
        <div>
          <span className="font-semibold">Novo:</span> agora você pode fixar conversas no topo clicando no ícone de pin em cada cartão para manter os atendimentos prioritários sempre à mão.
        </div>
      </div>

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

      <div className="flex flex-wrap items-center gap-2">
        {chips.map((chip) => {
          const active = chipFilter === chip.id;
          return (
            <button
              key={chip.id}
              type="button"
              onClick={() => setChipFilter(chip.id)}
              style={
                active
                  ? {
                      backgroundColor: "oklch(0.94 0.04 285)",
                      borderColor: "oklch(0.42 0.18 285)",
                      color: "oklch(0.42 0.18 285)",
                    }
                  : undefined
              }
              className={cn(
                "h-8 rounded-full border px-3 text-xs font-medium transition-colors",
                !active && "border-border bg-transparent text-muted-foreground hover:bg-muted/50",
              )}
            >
              {chip.label}
            </button>
          );
        })}
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
        <>
          <ul className="space-y-2">
            {paginated.map((r) => (
              <li key={r.id}>
                <Link
                  to={r.patient_id ? "/app/chat/$patientId" : "/app/general/$chatId"}
                  params={r.patient_id ? { patientId: r.patient_id } : { chatId: r.id }}
                  search={r.patient_id ? {} : { module: r.agent_type }}
                  className="block"
                >
                  <Card
                    className="p-4 cursor-pointer transition-[background] duration-[120ms] ease-[ease] hover:bg-[oklch(0.97_0.006_285)]"
                    style={r.pinned_at ? PINNED_STYLE : undefined}
                  >
                  <div className="flex items-start gap-4">
                    <Avatar className="h-11 w-11 shrink-0">
                      <AvatarImage src={r.avatar_url ?? undefined} />
                      <AvatarFallback className="bg-gradient-brand text-white text-xs font-semibold">
                        {r.agent_type === 'research' ? '🔍' : r.agent_type === 'reasoning' ? '🤔' : (r.patient_name || "??").slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {r.pinned_at && <Pin className="h-3.5 w-3.5 text-amber-600 fill-amber-500" />}
                        {editingChatId === r.id ? (
                          <div className="flex items-center gap-1 flex-1 min-w-0" onClick={(e) => e.stopPropagation()}>
                            <Input
                              autoFocus
                              value={editTitle}
                              onChange={(e) => setEditTitle(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleUpdateTitle(e, r.id);
                                if (e.key === 'Escape') setEditingChatId(null);
                              }}
                              className="h-7 text-sm bg-white border-amber-200 focus-visible:ring-amber-500"
                              disabled={isUpdatingTitle}
                            />
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                              onClick={(e) => handleUpdateTitle(e, r.id)}
                              disabled={isUpdatingTitle}
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setEditingChatId(null);
                              }}
                              disabled={isUpdatingTitle}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 min-w-0 flex-1 group/title">
                            <span className="font-medium truncate">
                              {r.title || r.patient_name || "Conversa sem título"}
                            </span>
                            {!r.patient_id && (
                              <button
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setEditingChatId(r.id);
                                  setEditTitle(r.title || "");
                                }}
                                className="opacity-0 group-hover/title:opacity-100 p-1 hover:bg-accent rounded transition-opacity shrink-0"
                              >
                                <Edit2 className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                              </button>
                            )}
                          </div>
                        )}
                        <StatusBadge updatedAt={r.updated_at} />
                        {(r.exam_count ?? 0) > 0 && (
                          <Badge variant="secondary" className="gap-1">
                            <FileText className="h-3 w-3" />
                            {r.exam_count} exame{(r.exam_count ?? 0) > 1 ? "s" : ""}
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
                    <TooltipProvider delayDuration={150}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={(e) => togglePin(e, r)}
                            className={cn("shrink-0 relative", r.pinned_at && "text-amber-600")}
                          >
                            {r.pinned_at ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                            <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-gradient-to-r from-[#e8a04c] to-[#e89bcf]" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="left" className="max-w-[220px] text-xs">
                          <p className="font-semibold text-[11px] uppercase tracking-wide bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] bg-clip-text text-transparent">
                            Novo recurso
                          </p>
                          <p className="mt-1">
                            {r.pinned_at
                              ? "Clique para desafixar esta conversa do topo."
                              : "Fixe esta conversa no topo da lista para acessá-la rapidamente."}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Exibir:</span>
              <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
                <SelectTrigger className="h-8 w-[80px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[10, 25, 50].map((n) => (
                    <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="text-xs text-muted-foreground">
              Exibindo {filtered.length === 0 ? 0 : startIdx + 1}–{endIdx} de {filtered.length} conversas
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="px-2 text-xs text-muted-foreground">
                {currentPage} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card className="p-4">
      <div className="text-2xl font-medium" style={{ fontFamily: "var(--font-mono)" }}>{value}</div>
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
  const trimmed = s.trim();
  if (trimmed.startsWith("{") || /"markers"|"name":/.test(trimmed)) {
    return "Análise de exame anexada.";
  }
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
