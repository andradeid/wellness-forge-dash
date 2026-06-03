import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Paperclip, Mic, ArrowUp, Plus, Search, MessageSquare, ArrowLeft, Loader2, UserPlus, Users, ClipboardList, Microscope, Pill, Pin, Edit2, Check, X, Droplet, TestTube, Scale, Activity, Dna, Stethoscope, Apple, Utensils, BookOpen, ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BirthDatePicker } from "@/components/BirthDatePicker";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useChatHistory, type ChatItem } from "@/hooks/useChatHistory";
import lummaSymbol from "@/assets/lumma-symbol.svg";

export const Route = createFileRoute("/app/fale-com-lumma")({
  validateSearch: (s: Record<string, unknown>) => ({
    module: typeof s.module === "string" ? s.module : undefined,
  }),
  component: FaleComLummaPage,
});

interface PatientItem {
  id: string;
  name: string;
  birth_date: string | null;
  gender: "male" | "female" | "other" | null;
  avatar_url: string | null;
  is_pregnant?: boolean;
  gestational_weeks?: number;
  pregnancy_type?: "single" | "multiple";
}

type Gender = "male" | "female" | "other";

function calcAge(birth: string | null): number | null {
  if (!birth) return null;
  const d = new Date(birth);
  if (Number.isNaN(d.getTime())) return null;
  const diff = Date.now() - d.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
}

function FaleComLummaPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { module: searchModule } = Route.useSearch();
  const { chats, loading: loadingChats, refresh: refreshHistory } = useChatHistory(200);
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
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
  const [pendingModule, setPendingModule] = useState<string | undefined>(searchModule);

  // Estado: modais de paciente
  const [identifyOpen, setIdentifyOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [patients, setPatients] = useState<PatientItem[]>([]);
  const [loadingPatients, setLoadingPatients] = useState(false);
  const [patientQuery, setPatientQuery] = useState("");
  const [selectedPatient, setSelectedPatient] = useState<PatientItem | null>(null);

  // Form: novo paciente
  const [newName, setNewName] = useState("");
  const [newBirthDate, setNewBirthDate] = useState("");
  const [newGender, setNewGender] = useState<Gender | null>(null);
  const [isPregnant, setIsPregnant] = useState(false);
  const [gestationalWeeks, setGestationalWeeks] = useState("");
  const [pregnancyType, setPregnancyType] = useState<"single" | "multiple">("single");
  const [creating, setCreating] = useState(false);

  const loadPatients = async () => {
    if (!user) return;
    setLoadingPatients(true);
    const { data } = await (supabase as any)
      .from("patients")
      .select("id, name, birth_date, gender, avatar_url, is_pregnant, gestational_weeks, pregnancy_type")
      .eq("created_by", user.id)
      .order("name", { ascending: true });
    setPatients((data as PatientItem[]) ?? []);
    setLoadingPatients(false);
  };

  useEffect(() => {
    if (identifyOpen) loadPatients();
  }, [identifyOpen, user]);

  const handleCreatePatient = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!newBirthDate) {
      toast.error("Selecione dia, mês e ano de nascimento");
      return;
    }
    setCreating(true);
    const { data, error } = await (supabase as any)
      .from("patients")
      .insert({
        created_by: user.id,
        name: newName,
        birth_date: newBirthDate,
        gender: newGender,
        is_pregnant: newGender === "female" ? isPregnant : false,
        gestational_weeks: newGender === "female" && isPregnant ? parseInt(gestationalWeeks) || null : null,
        pregnancy_type: newGender === "female" && isPregnant ? pregnancyType : null,
      })
      .select("id, name, birth_date, gender, avatar_url, is_pregnant, gestational_weeks, pregnancy_type")
      .single();
    setCreating(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Paciente cadastrado");
    setCreateOpen(false);
    setNewName("");
    setNewBirthDate("");
    setNewGender(null);
    setIsPregnant(false);
    setGestationalWeeks("");
    setPregnancyType("single");
    if (data) {
      setSelectedPatient(data as PatientItem);
      setPatients((prev) => [...prev, data as PatientItem]);
    }
  };

  const filteredPatients = useMemo(
    () =>
      patients.filter((p) =>
        p.name.toLowerCase().includes(patientQuery.toLowerCase())
      ),
    [patients, patientQuery]
  );

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

  const startGeneralChat = async (agentType: string) => {
    if (!user?.id) return;
    
    const { data, error } = await supabase
      .from('general_chats')
      .insert({
        agent_type: agentType,
        title: agentType === 'research' 
          ? 'Pesquisa Científica' 
          : 'Pergunta Clínica',
        created_by: user.id
      })
      .select('id')
      .single();

    if (error || !data) {
      console.error("Error creating general chat:", error);
      return;
    }
    
    navigate({ to: `/app/general/${data.id}`, search: { module: agentType } });
  };

  const filtered = useMemo(
    () =>
      chats.filter((c) =>
        c.title.toLowerCase().includes(query.toLowerCase())
      ),
    [chats, query]
  );



  return (
    <div className="relative h-full w-full overflow-hidden flex bg-gradient-to-br from-[#f3e8ff] via-[#e0f2fe] to-[#fce7f3]">
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
            onClick={() => {
              setPendingModule(undefined);
              setIdentifyOpen(true);
            }}
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
                    setActiveId(c.id);
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
                    activeId === c.id 
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
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              const isPinned = !!c.pinned_at;
                              const table = c.patient_id ? 'patient_chats' : 'general_chats';
                              const { error } = await supabase
                                .from(table)
                                .update({ pinned_at: isPinned ? null : new Date().toISOString() })
                                .eq('id', c.id);
                              
                              if (!error) {
                                await refreshHistory();
                                toast.success(isPinned ? "Conversa desfixada" : "Conversa fixada");
                              }
                            }}
                            className={cn(
                              "p-1 hover:bg-white/20 rounded transition-opacity shrink-0 mt-0.5",
                              c.pinned_at ? "opacity-100" : "opacity-0 group-hover/item:opacity-100"
                            )}
                          >
                            <Pin className={cn("h-3 w-3", c.pinned_at ? "text-white fill-white" : "text-white/70")} />
                          </button>
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
      <div className="relative flex-1 overflow-hidden">
        <div className="flex h-full flex-col items-center justify-between px-6 py-12">
          <div className="flex flex-1 flex-col items-center justify-center text-center max-w-4xl mx-auto w-full">
            <img
              src={lummaSymbol}
              alt="Lumma"
              className="h-20 w-20 mb-8 drop-shadow-sm"
            />
            <h1 className="text-5xl font-light tracking-tight text-foreground mb-6">
              Bem-vinda
            </h1>
            <p className="text-lg text-foreground/70 leading-relaxed mb-4 max-w-xl">
              Sou sua mentora virtual, inspirada na metodologia da Ana Paula
              Pujol. Estou aqui para apoiar seu raciocínio clínico em Nutrição
              Funcional e Integrativa.
            </p>
            
            <div className="w-full mt-8 space-y-8">
              {/* Linha 1: Análises e Uploads */}
              <div className="space-y-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground/50 text-left px-2">Análises e Uploads</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <button 
                    onClick={() => {
                      setPendingModule("exam");
                      setIdentifyOpen(true);
                    }}
                    className="flex flex-col items-center justify-center gap-3 p-6 rounded-2xl bg-white/40 backdrop-blur-md border border-white/60 shadow-sm hover:shadow-md hover:scale-[1.02] transition-all duration-300 group cursor-pointer"
                  >
                    <div className="p-3 rounded-xl bg-white/50 group-hover:bg-white transition-colors">
                      <Droplet className="h-6 w-6 text-[#e89bcf]" />
                    </div>
                    <span className="text-sm font-medium text-foreground/80">Exames de Sangue</span>
                  </button>

                  <button 
                    onClick={() => {
                      setPendingModule("exam");
                      setIdentifyOpen(true);
                    }}
                    className="flex flex-col items-center justify-center gap-3 p-6 rounded-2xl bg-white/40 backdrop-blur-md border border-white/60 shadow-sm hover:shadow-md hover:scale-[1.02] transition-all duration-300 group cursor-pointer"
                  >
                    <div className="p-3 rounded-xl bg-white/50 group-hover:bg-white transition-colors">
                      <Scale className="h-6 w-6 text-[#e89bcf]" />
                    </div>
                    <span className="text-sm font-medium text-foreground/80 text-center">Composição e Metabolismo</span>
                  </button>

                  <button 
                    onClick={() => {
                      setPendingModule("exam");
                      setIdentifyOpen(true);
                    }}
                    className="flex flex-col items-center justify-center gap-3 p-6 rounded-2xl bg-white/40 backdrop-blur-md border border-white/60 shadow-sm hover:shadow-md hover:scale-[1.02] transition-all duration-300 group cursor-pointer"
                  >
                    <div className="p-3 rounded-xl bg-white/50 group-hover:bg-white transition-colors">
                      <Dna className="h-6 w-6 text-[#e89bcf]" />
                    </div>
                    <span className="text-sm font-medium text-foreground/80">Genética e Microbioma</span>
                  </button>
                </div>
              </div>

              {/* Linha 2: Condutas e Entregas */}
              <div className="space-y-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground/50 text-left px-2">Condutas e Entregas</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <button 
                    onClick={() => startGeneralChat("reasoning")}
                    className="flex flex-col items-center justify-center gap-3 p-6 rounded-2xl bg-white/40 backdrop-blur-md border border-white/60 shadow-sm hover:shadow-md hover:scale-[1.02] transition-all duration-300 group cursor-pointer"
                  >
                    <div className="p-3 rounded-xl bg-white/50 group-hover:bg-white transition-colors">
                      <ClipboardList className="h-6 w-6 text-[#e8a04c]" />
                    </div>
                    <span className="text-sm font-medium text-foreground/80">Casos Clínicos & Sintomas</span>
                  </button>

                  <button 
                    onClick={() => {
                      setPendingModule("production");
                      setIdentifyOpen(true);
                    }}
                    className="flex flex-col items-center justify-center gap-3 p-6 rounded-2xl bg-white/40 backdrop-blur-md border border-white/60 shadow-sm hover:shadow-md hover:scale-[1.02] transition-all duration-300 group cursor-pointer"
                  >
                    <div className="p-3 rounded-xl bg-white/50 group-hover:bg-white transition-colors">
                      <Apple className="h-6 w-6 text-[#e8a04c]" />
                    </div>
                    <span className="text-sm font-medium text-foreground/80">Plano Alimentar & Receitas</span>
                  </button>

                  <button 
                    onClick={() => startGeneralChat("research")}
                    className="flex flex-col items-center justify-center gap-3 p-6 rounded-2xl bg-white/40 backdrop-blur-md border border-white/60 shadow-sm hover:shadow-md hover:scale-[1.02] transition-all duration-300 group cursor-pointer"
                  >
                    <div className="p-3 rounded-xl bg-white/50 group-hover:bg-white transition-colors">
                      <Search className="h-6 w-6 text-[#e8a04c]" />
                    </div>
                    <span className="text-sm font-medium text-foreground/80">Pesquisa Científica</span>
                  </button>
                </div>
              </div>
            </div>

            {selectedPatient && (
              <button
                type="button"
                onClick={() => setSelectedPatient(null)}
                className="mt-6 text-xs text-foreground/60 hover:text-foreground underline underline-offset-2"
              >
                Limpar paciente selecionado: {selectedPatient.name}
              </button>
            )}
          </div>

          {/* Barra de input */}
          <div className="w-full max-w-3xl">
            <div className="bg-white rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.06)] border border-white/60 p-4">
              <div className="flex items-center gap-3">
                <img src={lummaSymbol} alt="" className="h-6 w-6 shrink-0" />
                <input
                  type="text"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Escreva sua mensagem..."
                  className="flex-1 bg-transparent outline-none text-foreground placeholder:text-muted-foreground text-base"
                />
              </div>
              {searchModule && (
                <div className="mb-2 flex justify-center">
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1.5 rounded-full bg-white/80 backdrop-blur-sm border border-[#e8a04c]/30 px-3 py-1 text-[11px] font-medium text-foreground shadow-sm hover:bg-white transition group"
                      >
                        {(() => {
                          const agent = AGENT_OPTIONS.find(a => a.id === searchModule) || AGENT_OPTIONS[3];
                          const Icon = agent.icon;
                          return <Icon className="h-3.5 w-3.5 text-[#e8a04c]" />;
                        })()}
                        <span>{getActiveAgentLabel(searchModule)}</span>
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
                          const isActive = searchModule === opt.id;
                          return (
                            <div key={opt.id}>
                              {idx === 3 && <div className="my-1 border-t border-slate-100" />}
                              <button
                                onClick={() => {
                                  navigate({ to: "/app/fale-com-lumma", search: { module: opt.id } });
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
              )}
              <div className="flex items-center justify-between mt-3">
                <button
                  type="button"
                  className="h-9 w-9 rounded-full flex items-center justify-center text-white shadow-sm transition-opacity hover:opacity-90"
                  style={{
                    background:
                      "linear-gradient(135deg, #e8a04c 0%, #e89bcf 100%)",
                  }}
                >
                  <Paperclip className="h-4 w-4" />
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="h-9 w-9 rounded-full flex items-center justify-center text-white shadow-sm transition-opacity hover:opacity-90"
                    style={{
                      background:
                        "linear-gradient(135deg, #e8a04c 0%, #e89bcf 100%)",
                    }}
                  >
                    <Mic className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    className="h-9 w-9 rounded-full flex items-center justify-center text-white/90 shadow-sm transition-opacity hover:opacity-90"
                    style={{ background: "#f5c7d8" }}
                  >
                    <ArrowUp className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
            <p className="text-center text-xs text-muted-foreground mt-3">
              Máximo de 10 arquivos de 20MB
            </p>
          </div>
        </div>
      </div>

      {/* Modal: Identificar paciente */}
      <Dialog open={identifyOpen} onOpenChange={setIdentifyOpen}>
        <DialogContent className="sm:max-w-lg p-0 overflow-hidden rounded-2xl border-0 shadow-xl">
          <div className="h-1.5 bg-gradient-to-r from-[#e8a04c] to-[#e89bcf]" />
          <div className="px-6 pt-6 pb-2 bg-gradient-to-b from-[#f7f5f0] to-white">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-10 w-10 rounded-full bg-gradient-to-br from-[#e8a04c] to-[#e89bcf] flex items-center justify-center shadow-md">
                <Users className="h-5 w-5 text-white" />
              </div>
              <DialogHeader className="space-y-0 text-left flex-1">
                <DialogTitle className="text-lg font-semibold tracking-tight text-foreground text-left">
                  Identificar paciente
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground text-left">
                  Selecione um paciente já cadastrado ou crie um novo.
                </DialogDescription>
              </DialogHeader>
            </div>
          </div>
          <div className="px-6 pt-2 pb-4 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={patientQuery}
                onChange={(e) => setPatientQuery(e.target.value)}
                placeholder="Buscar paciente por nome..."
                className="pl-9 rounded-xl h-11"
              />
            </div>
            <ScrollArea className="h-72 rounded-xl border border-muted bg-white">
              {loadingPatients ? (
                <div className="flex items-center justify-center py-10 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              ) : filteredPatients.length === 0 ? (
                <div className="px-4 py-10 text-sm text-muted-foreground text-center">
                  Nenhum paciente encontrado.
                </div>
              ) : (
                <ul className="divide-y divide-muted/60">
                  {filteredPatients.map((p) => {
                    const age = calcAge(p.birth_date);
                    return (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedPatient(p);
                            setIdentifyOpen(false);
                            toast.success(`Paciente ${p.name} selecionado`);
                            navigate({
                              to: "/app/chat/$patientId",
                              params: { patientId: p.id },
                              search: pendingModule ? { module: pendingModule } : undefined,
                            });
                          }}
                          className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors"
                        >
                          <Avatar className="h-9 w-9">
                            <AvatarImage src={p.avatar_url ?? undefined} />
                            <AvatarFallback className="bg-gradient-to-br from-[#e8a04c] to-[#e89bcf] text-white text-xs">
                              {p.name.slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium text-foreground truncate">
                              {p.name}
                            </div>
                            <div className="text-xs text-muted-foreground">
                                {age !== null ? `${age} anos` : "Idade não informada"}
                                {p.gender === "male" ? " • Masculino" : p.gender === "female" ? " • Feminino" : p.gender === "other" ? " • Outro" : ""}
                                {p.is_pregnant && (
                                  <span className="text-[#e8a04c] font-medium">
                                    {" • Gestante"}
                                    {p.gestational_weeks ? ` (${p.gestational_weeks}s)` : ""}
                                  </span>
                                )}
                              </div>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </ScrollArea>
          </div>
          <DialogFooter className="px-6 pb-6 pt-0">
            <Button
              type="button"
              onClick={() => {
                setIdentifyOpen(false);
                setCreateOpen(true);
              }}
              className="w-full rounded-full h-11 bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] text-white border-0 hover:opacity-90 shadow-md font-medium"
            >
              <UserPlus className="h-4 w-4 mr-2" />
              Criar paciente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Criar paciente */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md p-0 overflow-hidden rounded-2xl border-0 shadow-xl">
          <div className="h-1.5 bg-gradient-to-r from-[#e8a04c] to-[#e89bcf]" />
          <div className="px-6 pt-6 pb-2 bg-gradient-to-b from-[#f7f5f0] to-white">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-10 w-10 rounded-full bg-gradient-to-br from-[#e8a04c] to-[#e89bcf] flex items-center justify-center shadow-md">
                <UserPlus className="h-5 w-5 text-white" />
              </div>
              <DialogHeader className="space-y-0 text-left flex-1">
                <DialogTitle className="text-lg font-semibold tracking-tight text-foreground text-left">
                  Novo paciente
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground text-left">
                  Cadastre um paciente. Mais campos virão na criação do chat.
                </DialogDescription>
              </DialogHeader>
            </div>
          </div>
          <form onSubmit={handleCreatePatient} className="space-y-4 px-6 pb-6 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="fcl-p-name" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Nome</Label>
              <Input
                id="fcl-p-name"
                required
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Nome completo"
                className="rounded-xl h-11 bg-white border-muted focus-visible:ring-[#e8a04c]/30"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Nascimento *</Label>
              <BirthDatePicker value={newBirthDate} onChange={setNewBirthDate} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Gênero</Label>
              <Select value={newGender ?? undefined} onValueChange={(v) => setNewGender(v as Gender)}>
                <SelectTrigger className="rounded-xl h-11 bg-white border-muted focus:ring-[#e8a04c]/30">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Masculino</SelectItem>
                  <SelectItem value="female">Feminino</SelectItem>
                  <SelectItem value="other">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {newGender === "female" && (
              <div className="space-y-4 p-4 rounded-xl bg-[#f7f5f0]/50 border border-muted/50 animate-in fade-in duration-300">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Paciente está gestante?</Label>
                  <div className="flex bg-white rounded-lg p-1 border border-muted shadow-sm">
                    <button
                      type="button"
                      onClick={() => setIsPregnant(false)}
                      className={cn(
                        "px-4 py-1.5 text-xs font-medium rounded-md transition-all",
                        !isPregnant 
                          ? "bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] text-white shadow-sm" 
                          : "text-muted-foreground hover:bg-muted/50"
                      )}
                    >
                      Não
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsPregnant(true)}
                      className={cn(
                        "px-4 py-1.5 text-xs font-medium rounded-md transition-all",
                        isPregnant 
                          ? "bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] text-white shadow-sm" 
                          : "text-muted-foreground hover:bg-muted/50"
                      )}
                    >
                      Sim
                    </button>
                  </div>
                </div>

                {isPregnant && (
                  <div className="grid grid-cols-2 gap-4 pt-2 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="space-y-1.5">
                      <Label htmlFor="weeks" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Semanas</Label>
                      <Input
                        id="weeks"
                        type="number"
                        min="1"
                        max="42"
                        value={gestationalWeeks}
                        onChange={(e) => setGestationalWeeks(e.target.value)}
                        placeholder="Ex: 24"
                        className="rounded-xl h-11 bg-white border-muted focus-visible:ring-[#e8a04c]/30"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Tipo</Label>
                      <Select value={pregnancyType} onValueChange={(v) => setPregnancyType(v as "single" | "multiple")}>
                        <SelectTrigger className="rounded-xl h-11 bg-white border-muted focus:ring-[#e8a04c]/30">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="single">Única</SelectItem>
                          <SelectItem value="multiple">Gemelar</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
              </div>
            )}
            <DialogFooter className="pt-2">
              <Button
                type="submit"
                disabled={creating}
                className="w-full rounded-full h-11 bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] text-white border-0 hover:opacity-90 shadow-md font-medium"
              >
                {creating ? "Salvando..." : "Salvar paciente"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
