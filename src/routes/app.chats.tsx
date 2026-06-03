import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { MessageSquare, Search, Clock, FileText, Pin, PinOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useChatHistory, type ChatItem } from "@/hooks/useChatHistory";

export const Route = createFileRoute("/app/chats")({
  component: ChatsCentralPage,
});

function ChatsCentralPage() {
  const { chats: rows, loading, refresh } = useChatHistory(200);
  const [search, setSearch] = useState("");

  const togglePin = async (e: React.MouseEvent, chat: ChatItem) => {
    e.preventDefault();
    e.stopPropagation();
    const next = chat.pinned_at ? null : new Date().toISOString();
    
    const { error } = await (supabase as any)
      .from("patient_chats")
      .update({ pinned_at: next })
      .eq("id", chat.id);

    if (error) {
      toast.error("Não foi possível atualizar a fixação.");
    } else {
      toast.success(next ? "Conversa fixada no topo." : "Conversa desafixada.");
      refresh();
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.patient_name?.toLowerCase().includes(q) ||
        r.last_message?.content?.toLowerCase().includes(q),
    );
  }, [rows, search]);

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

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Central de Conversas</h1>
        <p className="text-sm text-muted-foreground">
          Acompanhe todas as sessões de chat com seus pacientes em um só lugar.
        </p>
      </header>

      <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
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
                to={r.patient_id ? "/app/chat/$patientId" : "/app/general/$chatId"}
                params={r.patient_id ? { patientId: r.patient_id } : { chatId: r.id }}
                search={r.patient_id ? {} : { module: r.agent_type }}
                className="block"
              >
                <Card className={cn("p-4 hover:bg-accent/40 transition-colors", r.pinned_at && "border-amber-300 bg-amber-50/40")}>
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
                        <span className="font-medium truncate">
                          {r.patient_name ?? "Paciente removido"}
                        </span>
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
