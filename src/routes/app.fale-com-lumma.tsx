import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Paperclip, Mic, ArrowUp, Plus, Search, MessageSquare, ArrowLeft, Loader2, UserPlus, Users, ClipboardList, Microscope, Pill, Pin, Edit2, Check, X, Droplet, TestTube, Scale, Activity, Dna, Stethoscope, Apple, Utensils, BookOpen, ChevronDown, Sparkles, Volume2, VolumeX, User, UserMinus, Menu, Camera, LayoutDashboard } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { motion, AnimatePresence } from "framer-motion";
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
import { useAgentConfig } from "@/hooks/useAgentConfig";

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
  gender: "male" | "female" | null;
  avatar_url: string | null;
  is_pregnant?: boolean;
  gestational_weeks?: number;
  pregnancy_type?: "single" | "multiple";
  profile?: string;
}

type Gender = "male" | "female";

function calcAge(birth: string | null): number | null {
  if (!birth) return null;
  const d = new Date(birth);
  if (Number.isNaN(d.getTime())) return null;
  const diff = Date.now() - d.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
}

function FaleComLummaPage() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const { module: searchModule } = Route.useSearch();
  const { chats, loading: loadingChats, refresh: refreshHistory } = useChatHistory(200);
  const [message, setMessage] = useState("");
  const { agents, cards: superAgentCards, tasks: superAgentTasks, getAgentForCard, resolveAnaliseCompleta, requiresPatient, loading: loadingAgents } = useAgentConfig();
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
  const [pendingTrigger, setPendingTrigger] = useState<string | undefined>(searchModule);
  // Super Agente: quando o clique vem de um super_agent_card, guardamos agent+task
  // diretamente para navegação após a identificação do paciente (bypass do
  // getAgentForCard, que só resolve triggers globais).
  const [pendingSuperAgent, setPendingSuperAgent] = useState<
    { agentId: string; taskKey: string } | null
  >(null);

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
  const [menstrualCyclePhase, setMenstrualCyclePhase] = useState<string>("nao_sei");
  const [creating, setCreating] = useState(false);

  const loadPatients = async () => {
    if (!user) return;
    setLoadingPatients(true);
    const { data } = await (supabase as any)
      .from("patients")
      .select("id, name, birth_date, gender, avatar_url, is_pregnant, gestational_weeks, pregnancy_type")
      .eq("created_by", user.id)
      .order("name", { ascending: true });
    
    const mapped = (data as any[])?.map(p => ({
      ...p,
      profile: p.is_pregnant ? 'gestante' : p.gender === 'male' ? 'adulto_masculino' : p.gender === 'female' ? 'adulto_feminino' : undefined
    }));

    setPatients(mapped ?? []);
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
        menstrual_cycle_phase: newGender === "female" && !isPregnant ? menstrualCyclePhase : null,
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
    setMenstrualCyclePhase("nao_sei");
    if (data) {
      const patientWithProfile = {
        ...data,
        profile: data.is_pregnant ? 'gestante' : data.gender === 'male' ? 'adulto_masculino' : data.gender === 'female' ? 'adulto_feminino' : undefined
      } as PatientItem;
      setSelectedPatient(patientWithProfile);
      setPatients((prev) => [...prev, patientWithProfile]);
      
      // Navega automaticamente para o chat com o novo paciente
      if (pendingSuperAgent) {
        navigate({
          to: "/app/chat/$patientId",
          params: { patientId: data.id },
          search: {
            agent: pendingSuperAgent.agentId,
            task: pendingSuperAgent.taskKey,
          } as any,
        });
        setPendingSuperAgent(null);
      } else if (pendingTrigger) {
        const resolvedProfile = data.is_pregnant
          ? 'gestante'
          : data.gender === 'male'
          ? 'adulto_masculino'
          : data.gender === 'female'
          ? 'adulto_feminino'
          : undefined;

        if (pendingTrigger === 'analise_completa') {
          const resolved = resolveAnaliseCompleta(resolvedProfile, data.pregnancy_type ?? undefined);
          if (!resolved) {
            toast.error("Perfil incompleto para roteamento da Análise Completa.");
            return;
          }
          navigate({
            to: "/app/chat/$patientId",
            params: { patientId: data.id },
            search: { agent: resolved.agentId, task: resolved.taskKey } as any,
          });
          setPendingTrigger(undefined);
        } else {
          const agentId = getAgentForCard(
            pendingTrigger,
            resolvedProfile,
            data.pregnancy_type ?? undefined
          )?.agent_id;
          navigate({
            to: "/app/chat/$patientId",
            params: { patientId: data.id },
            search: { module: pendingTrigger, agent: agentId },
          });
        }
      } else {
        navigate({
          to: "/app/chat/$patientId",
          params: { patientId: data.id },
        });
      }
    }
  };

  const filteredPatients = useMemo(
    () =>
      patients.filter((p) =>
        p.name.toLowerCase().includes(patientQuery.toLowerCase())
      ),
    [patients, patientQuery]
  );

  const getActiveAgentLabel = (id: string | undefined) => {
    const agent = agents.find(a => a.agent_id === id);
    if (!agent) return "Pergunta Clínica";
    if (agent.agent_id === "exam") return "Analisando Exame";
    if (agent.agent_id === "production") return "Elaborando Plano & Receitas";
    return agent.label;
  };

  const startGeneralChat = async (agentType: string) => {
    if (!user?.id) return;
    
    const { data, error } = await supabase
      .from('general_chats')
      .insert({
        agent_type: agentType,
        title: agentType === 'research' 
          ? 'Pesquisa Científica' 
          : agentType === 'reasoning'
          ? 'Perguntas Clínicas'
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

  const greeting = (() => {
    // Hora de Brasília (UTC−3), independente do fuso do navegador
    const hourStr = new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      hour12: false,
    }).format(new Date());
    const h = parseInt(hourStr, 10);
    const t = h >= 5 && h < 12 ? "Bom dia" : h >= 12 && h < 18 ? "Boa tarde" : "Boa noite";
    const name = profile?.full_name?.split(" ")[0] ?? "";
    const pronoun = profile?.pronoun?.trim();
    if (!name) return `${t}.`;
    return pronoun ? `${t}, ${pronoun} ${name}.` : `${t}, ${name}.`;
  })();

  const [displayText, setDisplayText] = useState("");
  const [showSubtitle, setShowSubtitle] = useState(false);
  const [showCards, setShowCards] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(() => {
    const saved = localStorage.getItem("lumma_audio_enabled");
    return saved !== null ? saved === "true" : true;
  });
  const [currentAudio, setCurrentAudio] = useState<HTMLAudioElement | null>(null);
  const [audioBlocked, setAudioBlocked] = useState(false);

  useEffect(() => {
    // Som de saudação enviado pelo usuário
    const playGreetingSound = () => {
      // Verifica se o som já foi tocado nesta sessão (carregamento da página)
      const sessionPlayed = sessionStorage.getItem("lumma_greeting_played");
      if (!audioEnabled || sessionPlayed === "true") return;

      const audio = new Audio("/audio/saudacao-lumma.mp3");
      audio.volume = 0.5;
      setCurrentAudio(audio);
      audio.play()
        .then(() => {
          // Marca como tocado apenas se a reprodução foi bem-sucedida
          sessionStorage.setItem("lumma_greeting_played", "true");
        })
        .catch(err => {
          console.log("Autoplay blocked or audio error:", err);
          if (err.name === "NotAllowedError") {
            setAudioBlocked(true);
          }
        });
    };

    let i = 0;
    const interval = setInterval(() => {
      if (i === 0) {
        // Pequeno delay para garantir que a página "respirou"
        setTimeout(playGreetingSound, 200);
      }
      setDisplayText(greeting.slice(0, i));
      i++;
      if (i > greeting.length) {
        clearInterval(interval);
        setTimeout(() => setShowSubtitle(true), 400);
      }
    }, 70);
    return () => clearInterval(interval);
  }, [greeting, audioEnabled]);

  const toggleAudio = (enabled: boolean) => {
    setAudioEnabled(enabled);
    localStorage.setItem("lumma_audio_enabled", String(enabled));
    if (!enabled) {
      setAudioBlocked(false);
      if (currentAudio) {
        currentAudio.pause();
        currentAudio.currentTime = 0;
      }
    }
  };

  const handleManualPlay = () => {
    setAudioBlocked(false);
    const audio = new Audio("/audio/saudacao-lumma.mp3");
    audio.volume = 0.5;
    setCurrentAudio(audio);
    audio.play().catch(console.error);
    sessionStorage.setItem("lumma_greeting_played", "true");
  };



  return (
    <div className="relative h-full w-full overflow-hidden flex bg-gradient-to-br from-[#f3e8ff] via-[#e0f2fe] to-[#fce7f3]">
      {/* Painel lateral: últimos chats */}
      {/* Painel lateral: últimos chats */}
      <aside className="lumma-sidebar hidden md:flex w-72 shrink-0 flex-col border-r border-white/10 text-white">
        <div className="p-4 border-b border-white/10">
          {/* Atalhos (item 9 auditoria) — Dashboard primeiro */}
          <div className="space-y-1">
            <Link
              to="/app/dashboard"
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-white/80 hover:text-white hover:bg-white/10 transition-colors"
            >
              <LayoutDashboard className="h-4 w-4 shrink-0" />
              Dashboard
            </Link>
            <Link
              to="/app/patients"
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-white/80 hover:text-white hover:bg-white/10 transition-colors"
            >
              <Users className="h-4 w-4 shrink-0" />
              Pacientes
            </Link>
          </div>

          <div className="relative mt-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/50" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar conversas..."
              className="pl-8 h-9 text-sm rounded-lg bg-white/10 border-white/15 text-white placeholder:text-white/50 focus-visible:ring-white/30"
            />
          </div>

          <Button
            onClick={() => {
              setPendingTrigger(undefined);
              setIdentifyOpen(true);
            }}
            className="w-full mt-3 rounded-full text-white shadow-sm hover:shadow-md transition-shadow border-0"
            style={{
              background: "linear-gradient(135deg, #e8a04c 0%, #e89bcf 100%)",
            }}
          >
            <Plus className="h-4 w-4 mr-2" />
            Nova conversa
          </Button>
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
                          <span className="text-sm font-semibold text-white leading-tight truncate flex-1">
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
      <div className="relative flex-1 overflow-y-auto overflow-x-hidden">
        {/* Menu Hamburguer Mobile */}
        <div className="absolute top-6 left-6 z-20 md:hidden">
          <Sheet>
            <SheetTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="rounded-full bg-white/20 backdrop-blur-sm border-white/40 hover:bg-white/40 transition-all shadow-sm"
              >
                <Menu className="h-4 w-4 text-foreground/70" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0 border-r border-white/10 w-72 bg-gradient-to-br from-[#1a0b2e] to-[#0b0414] text-white">
              <div className="flex h-full flex-col">
                <div className="p-4 border-b border-white/10">
                  {/* Atalhos (item 9 auditoria) — Dashboard primeiro */}
                  <div className="space-y-1">
                    <Link
                      to="/app/dashboard"
                      className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                    >
                      <LayoutDashboard className="h-4 w-4 shrink-0" />
                      Dashboard
                    </Link>
                    <Link
                      to="/app/patients"
                      className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                    >
                      <Users className="h-4 w-4 shrink-0" />
                      Pacientes
                    </Link>
                  </div>

                  <div className="relative mt-3">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/50" />
                    <Input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Buscar conversas..."
                      className="pl-8 h-9 text-sm rounded-lg bg-white/10 border-white/15 text-white placeholder:text-white/50 focus-visible:ring-white/30"
                    />
                  </div>

                  <Button
                    onClick={() => {
                      setPendingTrigger(undefined);
                      setIdentifyOpen(true);
                    }}
                    className="w-full mt-3 rounded-full text-white shadow-sm hover:shadow-md transition-shadow border-0"
                    style={{
                      background: "linear-gradient(135deg, #e8a04c 0%, #e89bcf 100%)",
                    }}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Nova conversa
                  </Button>
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
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-white leading-tight truncate flex-1">
                                {c.title || c.patient_name}
                              </span>
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
              </div>
            </SheetContent>
          </Sheet>
        </div>

        {/* Controle de áudio removido (item 6 da auditoria) */}


        <div className="flex min-h-full flex-col items-center justify-center px-6 pt-6 sm:pt-12 pb-12">
          <div className="flex flex-col items-center justify-center text-center max-w-4xl mx-auto w-full">
            <motion.img
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5 }}
              src={lummaSymbol}
              alt="Lumma"
              className="h-20 w-20 mb-8 drop-shadow-sm"
            />
            <h1 
              className="text-3xl sm:text-5xl bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] bg-clip-text text-transparent mb-3 sm:mb-4 min-h-[1.2em]"
              style={{ fontFamily: "'Instrument Serif', serif" }}
            >
              {displayText}
            </h1>
            
            <AnimatePresence>
              {showSubtitle && (
                <motion.p 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, ease: "easeOut" }}
                  onAnimationComplete={() => setShowCards(true)}
                  className="text-base sm:text-lg text-foreground/70 leading-relaxed mb-8 sm:mb-12 max-w-xl"
                >
                  Sou sua mentora virtual, inspirada na metodologia da Ana Paula
                  Pujol. Estou aqui para apoiar seu raciocínio clínico em Nutrição
                  Funcional e Integrativa.
                </motion.p>
              )}
            </AnimatePresence>
            
            <div className="w-full space-y-12">


              {/* Análises Clínicas — títulos unificados (item 3 auditoria) */}
              <AnimatePresence>
                {showCards && (

                  <div className="space-y-4">
                    <motion.h3
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.5 }}
                      className="text-xs font-semibold uppercase tracking-wider text-foreground/50 text-left px-2"
                    >
                      Análises Clínicas
                    </motion.h3>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4">
                      {[
                        { trigger: "exames_de_sangue", icon: Droplet, title: "Exames de Sangue", color: "#e89bcf" },
                        { trigger: "composicao_metabolismo", icon: Scale, title: "Composição e Metabolismo", color: "#e89bcf" },
                        { trigger: "genetica_microbioma", icon: Dna, title: "Genética e Microbioma", color: "#e89bcf" },
                        { trigger: "estimativa_refeicao_foto", icon: Utensils, title: "Refeição por Foto", color: "#e8a04c" },
                        { trigger: "composicao_corporal_foto", icon: Activity, title: "Composição por Foto", color: "#4ade80" },
                        { trigger: "nutricao_visual", icon: Camera, title: "Nutrição Visual", color: "#facc15" },
                        { trigger: "casos_clinicos", icon: ClipboardList, title: "Casos Clínicos & Sintomas", color: "#e8a04c" },
                        { trigger: "plano_alimentar", icon: Apple, title: "Plano Alimentar & Receitas", color: "#e8a04c" },
                        { trigger: "pesquisa_cientifica", icon: Search, title: "Pesquisa Científica", color: "#e8a04c" },
                        { trigger: "perguntas_clinicas", icon: MessageSquare, title: "Perguntas Clínicas", color: "#e8a04c" },
                      ].map((card, idx) => {
                        const agent = getAgentForCard(card.trigger, selectedPatient?.profile, selectedPatient?.pregnancy_type);
                        // Exames de sangue depende do perfil clínico do paciente — se ainda não há paciente
                        // selecionado, mantemos o card visível e abrimos a identificação no clique.
                        // "perguntas_clinicas" é dúvida geral do nutri (sem paciente) — reaproveita o
                        // agente "reasoning" (mesmo de Casos Clínicos) mas sem trava de paciente.
                        if (!agent && card.trigger !== "exames_de_sangue" && card.trigger !== "perguntas_clinicas") return null;

                        return (
                          <motion.button
                            key={card.trigger}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.5, delay: idx * 0.08, ease: "easeOut" }}
                            onClick={() => {
                              if (card.trigger === "perguntas_clinicas") {
                                startGeneralChat("reasoning");
                                return;
                              }
                              if (!agent || requiresPatient(agent.agent_id)) {
                                setPendingTrigger(card.trigger);
                                setIdentifyOpen(true);
                              } else {
                                startGeneralChat(agent.agent_id);
                              }
                            }}

                            className="flex flex-row sm:flex-col items-center justify-start sm:justify-center gap-3 p-3 sm:p-6 min-h-[52px] sm:min-h-[120px] rounded-xl sm:rounded-2xl bg-white/40 backdrop-blur-md border border-white/60 shadow-sm hover:shadow-md hover:scale-[1.01] sm:hover:scale-[1.02] transition-all duration-300 group cursor-pointer relative"
                          >
                            <div className="p-2 sm:p-3 rounded-lg sm:rounded-xl bg-white/50 group-hover:bg-white transition-colors shrink-0">
                              <card.icon className="h-5 w-5 sm:h-6 sm:w-6" style={{ color: card.color }} />
                            </div>
                            <span className="text-sm font-medium text-foreground/80 flex-1 text-left sm:text-center">{card.title}</span>
                            <ChevronDown className="h-4 w-4 text-foreground/30 sm:hidden -rotate-90" />
                          </motion.button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </AnimatePresence>

              {/* Super Agentes — quiescente enquanto não houver cards cadastrados */}
              {(() => {
                const activeCards = superAgentCards.filter((c) => c.is_active);
                // Dedupe por card_trigger: cards que compartilham trigger (ex: "analise_completa"
                // vinculado aos 4 super agentes por perfil) aparecem como UM único card na Home.
                // O agente correto é resolvido no clique via resolveAnaliseCompleta().
                const seenTriggers = new Set<string>();
                const dedupedCards = activeCards.filter((c) => {
                  if (!c.card_trigger) return true;
                  if (seenTriggers.has(c.card_trigger)) return false;
                  seenTriggers.add(c.card_trigger);
                  return true;
                });
                if (dedupedCards.length === 0) return null;
                return (
                  <div className="space-y-4">
                    <motion.h3
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.5 }}
                      className="text-xs font-semibold uppercase tracking-wider text-foreground/50 text-left px-2 flex items-center gap-2"
                    >
                      <Sparkles className="h-3 w-3 text-[#e8a04c]" />
                      Super Agentes
                    </motion.h3>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4">
                      {dedupedCards.map((card, idx) => {
                        const task = superAgentTasks.find((t) => t.id === card.task_id);
                        if (!task || !task.is_active) return null;
                        const agent = agents.find((a) => a.agent_id === task.agent_id && a.is_super_agent);
                        if (!agent || !agent.is_active) return null;

                        // Card com roteamento por perfil (ex: "analise_completa"):
                        // no clique, resolve o par (agent, task) certo conforme paciente.
                        const isRoutedByProfile = card.card_trigger === 'analise_completa';

                        const handleClick = () => {
                          let target: { agentId: string; taskKey: string } = {
                            agentId: agent.agent_id,
                            taskKey: task.task_key,
                          };

                          if (isRoutedByProfile) {
                            if (!selectedPatient) {
                              // Precisa do perfil da paciente antes de rotear
                              setPendingSuperAgent(null);
                              setPendingTrigger(card.card_trigger ?? undefined);
                              setIdentifyOpen(true);
                              return;
                            }
                            const resolved = resolveAnaliseCompleta(
                              selectedPatient.profile,
                              selectedPatient.pregnancy_type ?? undefined,
                            );
                            if (!resolved) {
                              toast.error(
                                "Perfil da paciente incompleto. Edite o cadastro (sexo e, se gestante, tipo de gestação) para usar este card.",
                              );
                              return;
                            }
                            target = resolved;
                          }

                          setPendingSuperAgent(target);
                          setPendingTrigger(undefined);
                          if (requiresPatient(target.agentId) && !selectedPatient) {
                            setIdentifyOpen(true);
                          } else if (selectedPatient) {
                            navigate({
                              to: "/app/chat/$patientId",
                              params: { patientId: selectedPatient.id },
                              search: {
                                agent: target.agentId,
                                task: target.taskKey,
                              } as any,
                            });
                            setPendingSuperAgent(null);
                          } else {
                            setIdentifyOpen(true);
                          }
                        };

                        return (
                          <motion.button
                            key={card.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.5, delay: idx * 0.06, ease: "easeOut" }}
                            onClick={handleClick}
                            className="flex flex-row sm:flex-col items-center justify-start sm:justify-center gap-3 p-3 sm:p-6 min-h-[52px] sm:min-h-[120px] rounded-xl sm:rounded-2xl bg-gradient-to-br from-[#e8a04c]/10 to-[#e89bcf]/10 backdrop-blur-md border border-white/60 shadow-sm hover:shadow-md hover:scale-[1.01] sm:hover:scale-[1.02] transition-all duration-300 group cursor-pointer relative"
                          >
                            <div className="p-2 sm:p-3 rounded-lg sm:rounded-xl bg-white/60 group-hover:bg-white transition-colors shrink-0">
                              <Sparkles className="h-5 w-5 sm:h-6 sm:w-6 text-[#e8a04c]" />
                            </div>
                            <span className="text-sm font-medium text-foreground/80 flex-1 text-left sm:text-center">
                              {card.label}
                            </span>
                            <ChevronDown className="h-4 w-4 text-foreground/30 sm:hidden -rotate-90" />
                          </motion.button>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
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
                            
                            if (pendingSuperAgent) {
                              navigate({
                                to: "/app/chat/$patientId",
                                params: { patientId: p.id },
                                search: {
                                  agent: pendingSuperAgent.agentId,
                                  task: pendingSuperAgent.taskKey,
                                } as any,
                              });
                              setPendingSuperAgent(null);
                              return;
                            }

                            const resolvedProfile = p.is_pregnant
                              ? 'gestante'
                              : p.gender === 'male'
                              ? 'adulto_masculino'
                              : p.gender === 'female'
                              ? 'adulto_feminino'
                              : undefined;

                            if (pendingTrigger === 'analise_completa') {
                              const resolved = resolveAnaliseCompleta(resolvedProfile, p.pregnancy_type ?? undefined);
                              if (!resolved) {
                                toast.error("Perfil incompleto para roteamento da Análise Completa.");
                                setPendingTrigger(undefined);
                                return;
                              }
                              navigate({
                                to: "/app/chat/$patientId",
                                params: { patientId: p.id },
                                search: { agent: resolved.agentId, task: resolved.taskKey } as any,
                              });
                              setPendingTrigger(undefined);
                              return;
                            }

                            const agentId = pendingTrigger ? getAgentForCard(
                              pendingTrigger,
                              resolvedProfile,
                              p.pregnancy_type ?? undefined
                            )?.agent_id : undefined;

                            navigate({
                              to: "/app/chat/$patientId",
                              params: { patientId: p.id },
                              search: pendingTrigger ? { module: pendingTrigger, agent: agentId } : undefined,
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
                                {p.gender === "male" ? " • Masculino" : p.gender === "female" ? " • Feminino" : ""}
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
                  <SelectItem value="female">Feminino</SelectItem>
                  <SelectItem value="male">Masculino</SelectItem>
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
                      <Select value={pregnancyType ?? ""} onValueChange={(v) => setPregnancyType(v as "single" | "multiple")}>
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

                {!isPregnant && (
                  <div className="space-y-1.5 pt-2 animate-in fade-in duration-300">
                    <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Fase do ciclo menstrual
                    </Label>
                    <Select value={menstrualCyclePhase ?? ""} onValueChange={setMenstrualCyclePhase}>
                      <SelectTrigger className="rounded-xl h-11 bg-white border-muted focus:ring-[#e8a04c]/30">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="folicular">Folicular</SelectItem>
                        <SelectItem value="ovulatoria">Ovulatória</SelectItem>
                        <SelectItem value="lutea">Lútea</SelectItem>
                        <SelectItem value="nao_menstrua">Paciente não menstrua</SelectItem>
                        <SelectItem value="menopausa">Paciente na menopausa</SelectItem>
                        <SelectItem value="nao_sei">Não sei</SelectItem>
                      </SelectContent>
                    </Select>
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
