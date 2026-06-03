import { createFileRoute, Link, useParams, useSearch, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Menu, ShieldCheck, Plus, Search, Loader2, Pin, Edit2, Check, X, ChevronDown, Droplet, Scale, Dna, Apple, BookOpen, ClipboardList } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
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

  const AGENT_OPTIONS = [
    { id: "exam", title: "Exames de Sangue", icon: Droplet, color: "#e89bcf", line: 1 },
    { id: "metabolism", title: "Composição e Metabolismo", icon: Scale, color: "#e89bcf", line: 1 },
    { id: "genetics", title: "Genética e Microbioma", icon: Dna, color: "#e89bcf", line: 1 },
    { id: "reasoning", title: "Casos Clínicos & Sintomas", icon: ClipboardList, color: "#e8a04c", line: 2 },
    { id: "production", title: "Plano Alimentar & Receitas", icon: Apple, color: "#e8a04c", line: 2 },
    { id: "research", title: "Pesquisa Científica", icon: BookOpen, color: "#e8a04c", line: 2 },
  ];

  const getActiveAgentLabel = (id: string | undefined) => {
    const agent = AGENT_OPTIONS.find(a => a.id === id);
    if (!agent) return "Pergunta Clínica";
    if (agent.id === "exam") return "Analisando Exame";
    if (agent.id === "production") return "Elaborando Plano & Receitas";
    return agent.title;
  };

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
                    <div className="flex items-center gap-2 w-full">
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
                            className="p-1 hover:bg-white/20 rounded text-emerald-400 shrink-0"
                            disabled={isUpdatingTitle}
                          >
                            <Check className="h-3 w-3" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-start gap-1.5 min-w-0 flex-1">
                          <span className="text-sm font-semibold text-white leading-tight break-words overflow-hidden">
                            {c.title || c.patient_name}
                          </span>
                          {!c.patient_id && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingChatId(c.id);
                                setEditTitle(c.title || "");
                              }}
                              className="opacity-0 group-hover/item:opacity-100 p-1 hover:bg-white/20 rounded transition-opacity shrink-0 mt-0.5"
                            >
                              <Edit2 className="h-3 w-3 text-white/70" />
                            </button>
                          )}
                        </div>
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
            <div className="mb-2 flex justify-center">
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 rounded-full bg-white/80 backdrop-blur-sm border border-[#e8a04c]/30 px-3 py-1 text-[11px] font-medium text-foreground shadow-sm hover:bg-white transition group"
                  >
                    {(() => {
                      const agent = AGENT_OPTIONS.find(a => a.id === agentType) || AGENT_OPTIONS[3];
                      const Icon = agent.icon;
                      return <Icon className="h-3.5 w-3.5 text-[#e8a04c]" />;
                    })()}
                    <span>{getActiveAgentLabel(agentType)}</span>
                    <span className="text-muted-foreground/70 text-[10px]">• trocar</span>
                    <ChevronDown className="h-3 w-3 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
                  </button>
                </PopoverTrigger>
                <PopoverContent 
                  side="top" 
                  align="center" 
                  className="w-64 p-2 rounded-2xl bg-white/90 backdrop-blur-xl border-white/60 shadow-2xl"
                >
                  <div className="space-y-1">
                    {AGENT_OPTIONS.map((opt, idx) => {
                      const Icon = opt.icon;
                      const isActive = agentType === opt.id;
                      return (
                        <div key={opt.id}>
                          {idx === 3 && <div className="my-1 border-t border-slate-100" />}
                          <button
                            onClick={() => {
                              navigate({ to: `/app/general/${chatId}`, search: { module: opt.id } });
                            }}
                            className={cn(
                              "w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium transition-all group/opt",
                              isActive 
                                ? "bg-gradient-to-r from-[#fef2f8] to-[#fff7ed] text-foreground border border-[#e8a04c]/20" 
                                : "text-foreground/70 hover:bg-white hover:text-foreground hover:shadow-sm"
                            )}
                          >
                            <div className={cn(
                              "p-1.5 rounded-lg transition-colors",
                              isActive ? "bg-white shadow-sm" : "bg-slate-100 group-hover/opt:bg-white"
                            )}>
                              <Icon className="h-3.5 w-3.5" style={{ color: opt.color }} />
                            </div>
                            <span className="flex-1 text-left">{opt.title}</span>
                            {isActive && <div className="h-1.5 w-1.5 rounded-full bg-[#e8a04c]" />}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
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
