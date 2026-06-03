import { createFileRoute, Link, useParams, useSearch, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Menu, ShieldCheck, Plus, Search, Loader2, Pin, Edit2, Check, X } from "lucide-react";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ChatMessageList } from "@/components/chat/ChatMessageList";
import { ChatInput } from "@/components/chat/ChatInput";
import { useGeneralChat } from "@/hooks/useGeneralChat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { useChatHistory } from "@/hooks/useChatHistory";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import lummaSymbol from "@/assets/lumma-symbol.svg";

export const Route = createFileRoute("/app/general/$chatId")({
  validateSearch: (s: Record<string, unknown>) => ({
    module: typeof s.module === "string" ? s.module : "research",
  }),
  component: GeneralChatPage,
});

function GeneralChatPage() {
  const { chatId } = useParams({ from: "/app/general/$chatId" });
  const { module: agentType } = Route.useSearch();
  const navigate = useNavigate();
  const { messages, sendMessage, thinking } = useGeneralChat(chatId, agentType);
  const [query, setQuery] = useState("");
  const { chats, loading: loadingChats, refresh: refreshHistory } = useChatHistory(200);
  const { role, user } = useAuth();
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [isUpdatingTitle, setIsUpdatingTitle] = useState(false);

  const handleUpdateTitle = async (id: string) => {
    if (!editTitle.trim()) return;
    setIsUpdatingTitle(true);
    try {
      const { error } = await supabase
        .from("general_chats")
        .update({ title: editTitle.trim() })
        .eq("id", id);
      
      if (error) throw error;
      await refreshHistory();
      setEditingChatId(null);
    } catch (err) {
      console.error("Erro ao atualizar título:", err);
    } finally {
      setIsUpdatingTitle(false);
    }
  };

  const filtered = useMemo(
    () =>
      chats.filter((c) =>
        (c.patient_name || c.title || "").toLowerCase().includes(query.toLowerCase())
      ),
    [chats, query]
  );

  return (
    <div className="relative h-screen w-full overflow-hidden flex bg-gradient-to-br from-[#f3e8ff] via-[#e0f2fe] to-[#fce7f3]">
      {/* Painel lateral: últimos chats */}

      {/* Painel lateral: últimos chats */}
      <aside className="lumma-sidebar hidden md:flex w-72 shrink-0 flex-col border-r border-white/10 text-white">
        <div className="p-4 border-b border-white/10">
          <Link
            to="/app/dashboard"
            className="inline-flex items-center gap-1.5 text-xs text-white/70 hover:text-white transition-colors mb-3"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Voltar ao Dashboard
          </Link>
          <Button
            onClick={() => navigate({ to: "/app/fale-com-lumma" })}
            className="w-full rounded-full text-white shadow-sm hover:shadow-md transition-shadow border-0"
            style={{
              background: "linear-gradient(135deg, #e8a04c 0%, #e89bcf 100%)",
            }}
          >
            <Plus className="h-4 w-4 mr-2" />
            Nova conversa
          </Button>
          <div className="relative mt-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/50" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar conversas..."
              className="pl-8 h-9 text-sm rounded-lg bg-white/10 border-white/15 text-white placeholder:text-white/50 focus-visible:ring-white/30"
            />
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="px-2 py-3 space-y-1">
            <div className="px-2 pb-1 text-[10px] uppercase tracking-wider text-white/50 font-semibold">
              Recentes
            </div>
            {loadingChats ? (
              <div className="flex items-center justify-center py-8 text-white/60">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="px-3 py-6 text-xs text-white/60 text-center">
                Nenhuma conversa encontrada.
              </div>
            ) : (
              filtered.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    if (c.patient_id) {
                      navigate({
                        to: "/app/chat/$patientId",
                        params: { patientId: c.patient_id },
                        search: { chatId: c.id },
                      });
                    } else {
                      navigate({
                        to: `/app/general/${c.id}`,
                        search: { module: c.agent_type || 'research' }
                      });
                    }
                  }}
                  className={`w-full text-left px-3 py-3 rounded-xl flex items-center gap-3 transition-all duration-200 group ${
                    chatId === c.id 
                      ? "bg-white/20 shadow-sm" 
                      : "hover:bg-white/10"
                  }`}
                >
                  <div className="relative shrink-0">
                    <Avatar className="h-9 w-9 border-2 border-white/20">
                      <AvatarImage src={c.avatar_url || undefined} />
                      <AvatarFallback className="bg-white/20 text-white text-[10px] font-bold">
                        {c.agent_type === 'research' ? '🔍' : c.agent_type === 'reasoning' ? '🤔' : (c.patient_name || "??").slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    {c.pinned_at && (
                      <Pin className="absolute -top-1 -right-1 h-3 w-3 text-white fill-white drop-shadow-sm" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1 group/item">
                    <div className="flex items-center gap-2">
                      {editingChatId === c.id ? (
                        <div className="flex items-center gap-1 flex-1 min-w-0" onClick={(e) => e.stopPropagation()}>
                          <Input
                            autoFocus
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleUpdateTitle(c.id);
                              if (e.key === 'Escape') setEditingChatId(null);
                            }}
                            className="h-6 text-xs bg-white/10 border-white/20 text-white p-1"
                            disabled={isUpdatingTitle}
                          />
                          <button 
                            onClick={() => handleUpdateTitle(c.id)}
                            className="p-1 hover:bg-white/20 rounded text-emerald-400"
                            disabled={isUpdatingTitle}
                          >
                            <Check className="h-3 w-3" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="text-sm font-semibold text-white truncate leading-none flex-1">
                            {c.title}
                          </div>
                          {!c.patient_id && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingChatId(c.id);
                                setEditTitle(c.title || "");
                              }}
                              className="opacity-0 group-hover/item:opacity-100 p-1 hover:bg-white/20 rounded transition-opacity"
                            >
                              <Edit2 className="h-3 w-3 text-white/70" />
                            </button>
                          )}
                        </>
                      )}
                      {c.agent_type && (
                        <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded-full bg-white/20 text-white/90 font-bold uppercase tracking-tighter">
                          {c.agent_type === "exam" && "Exame"}
                          {c.agent_type === "production" && "Produção"}
                          {c.agent_type === "reasoning" && "Clínico"}
                          {c.agent_type === "research" && "Pesquisa"}
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-white/60 mt-1 font-medium">
                      {formatDistanceToNow(new Date(c.updated_at), {
                        addSuffix: true,
                        locale: ptBR,
                      })}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </ScrollArea>
      </aside>

      {/* Área principal */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <main className="relative flex-1 min-h-0 overflow-hidden flex flex-col">
          <ChatMessageList 
            messages={messages} 
            thinking={thinking} 
            isStreaming={thinking}
            agentType={agentType}
          />
        </main>

        <div className="shrink-0 px-3 sm:px-4 pb-4 sm:pb-6 pt-3">
          <div className="mx-auto w-full max-w-3xl">
            <ChatInput onSubmit={(text) => sendMessage(text)} disabled={thinking} />
            <p className="mt-1 text-center text-[10px] text-muted-foreground/60">
              Máximo de 10 arquivos de 20MB
            </p>
            {role === "nutri" && (
              <p className="mt-1 text-center text-[10px] italic text-amber-700/80 px-2">
                Nota: Processamento estrutural em modo de validação técnica.
              </p>
            )}
            <TooltipProvider delayDuration={150}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <p className="mt-3 flex items-start sm:items-center justify-center gap-1.5 text-center text-[10px] text-muted-foreground/70 cursor-help select-none px-2">
                    <ShieldCheck className="h-3 w-3 text-[#7a8f6a] shrink-0 mt-0.5 sm:mt-0" />
                    <span>
                      Análises baseadas nos protocolos de inteligência integrativa da Dra. Ana
                      Paula. Sempre confira os dados estruturados com o laudo original do
                      laboratório.
                    </span>
                  </p>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs text-[11px] leading-relaxed">
                  A LUMMA é uma ferramenta de suporte à decisão. A validação final e a conduta
                  clínica são de responsabilidade exclusiva do nutricionista conforme as normas
                  do CRN.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </div>
    </div>
  );
}
