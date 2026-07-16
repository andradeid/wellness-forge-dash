import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ClipboardList, Eye, MessageSquare, Stethoscope, Menu, Plus, ShieldCheck, TrendingUp, ChevronDown, Droplet, Scale, Dna, Apple, BookOpen, Search, Sparkles, Utensils, Activity, Camera } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useReactToPrint } from "react-to-print";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useDifyChat } from "@/hooks/useDifyChat";
import { ChatMessageList } from "@/components/chat/ChatMessageList";
import { ChatInput } from "@/components/chat/ChatInput";
import { ChatIntentPanel, emptyFilters, faseCicloToInput, filtersToContext, type ExamFilters } from "@/components/chat/ChatIntentPanel";
import { ExamHistoryList, type ExamItem } from "@/components/chat/ExamHistoryList";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
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

import { Button } from "@/components/ui/button";
import { useBrandingProfile } from "@/hooks/useBrandingProfile";
import { PatientReportPDF } from "@/components/branding/PatientReportPDF";
import { ChatConversationPDF } from "@/components/chat/ChatConversationPDF";
import { PatientChatHistory } from "@/components/chat/PatientChatHistory";
import { InactiveChatBanner } from "@/components/chat/InactiveChatBanner";
import { NextStepsSuggestion } from "@/components/chat/NextStepsSuggestion";
import { format, differenceInYears } from "date-fns";
import lummaSymbol from "@/assets/lumma-symbol.svg";
import { useAgentConfig } from "@/hooks/useAgentConfig";
import { getAgentIcon } from "@/lib/agent-icons";

export const Route = createFileRoute("/app/chat/$patientId")({
  validateSearch: (s: Record<string, unknown>) => ({
    chatId: typeof s.chatId === "string" ? s.chatId : undefined,
    messageId: typeof s.messageId === "string" ? s.messageId : undefined,
    module: typeof s.module === "string" ? s.module : undefined,
    agent: typeof s.agent === "string" ? s.agent : undefined,
    task: typeof s.task === "string" ? s.task : undefined,
  }),
  component: ChatPage,
});

const CARD_ICONS: Record<string, any> = {
  exames_de_sangue: Droplet,
  composicao_metabolismo: Scale,
  genetica_microbioma: Dna,
  casos_clinicos: ClipboardList,
  plano_alimentar: Apple,
  pesquisa_cientifica: Search,
  estimativa_refeicao_foto: Utensils,
  composicao_corporal_foto: Activity,
  nutricao_visual: Camera,
};

const CARD_LABELS: Record<string, string> = {
  exames_de_sangue: "Exames de Sangue",
  plano_alimentar: "Plano Alimentar & Receitas",
  casos_clinicos: "Casos Clínicos & Sintomas",
  pesquisa_cientifica: "Pesquisa Científica",
  composicao_metabolismo: "Composição e Metabolismo",
  genetica_microbioma: "Genética e Microbioma",
  estimativa_refeicao_foto: "Refeição por Foto",
  composicao_corporal_foto: "Composição por Foto",
  nutricao_visual: "Nutrição Visual",
};

const CARD_COLORS: Record<string, string> = {
  exames_de_sangue: "#e89bcf",
  composicao_metabolismo: "#e89bcf",
  genetica_microbioma: "#e89bcf",
  casos_clinicos: "#e8a04c",
  plano_alimentar: "#e8a04c",
  pesquisa_cientifica: "#e8a04c",
  estimativa_refeicao_foto: "#e8a04c",
  composicao_corporal_foto: "#4ade80",
  nutricao_visual: "#facc15",
};

interface PatientCtx {
  id: string;
  name: string;
  birth_date: string | null;
  gender: "male" | "female" | null;
  avatar_url: string | null;
  is_pregnant?: boolean;
  gestational_weeks?: number;
  pregnancy_type?: "single" | "multiple";
  menstrual_cycle_phase?: string | null;
}

function ChatPage() {
  const { patientId } = Route.useParams();
  const { chatId: forceChatId, messageId: highlightId, module: initialModule, agent: initialAgent, task: initialTask } = Route.useSearch();
  const navigate = useNavigate();
  const { role, profile } = useAuth();
  const readOnly = role === "admin" || role === "super_admin";
  const [patient, setPatient] = useState<PatientCtx | null>(null);
  const [exams, setExams] = useState<ExamItem[]>([]);
  const [reportMarkers, setReportMarkers] = useState<any[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [filters, setFilters] = useState<ExamFilters>(emptyFilters());
  const [menuOpen, setMenuOpen] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);
  const conversationRef = useRef<HTMLDivElement>(null);
  const { data: branding } = useBrandingProfile(userId);
  const { agents, tasks: superAgentTasks, cards: superAgentCards, getAgentForCard, loading: loadingAgents } = useAgentConfig();
  const { messages, thinking, thinkingMode, sendMessage, sendHandoff, chatId, error, uploadProgress, removeUploadItem, resetChat, setContext, agentType, setAgentType, examContext, activeAgents, setSelectedTask, selectedTask } = useDifyChat(patientId, {
    readOnly,
    forceChatId: forceChatId ?? null,
    initialAgentType: initialAgent ?? (initialModule ? getAgentForCard(initialModule, "", undefined)?.agent_id : undefined),
    initialSelectedTask: initialTask ?? null,
    forceNewChat: !!initialAgent && !forceChatId,
  });


  // Super Agente: propaga o task_key vindo da URL para o hook. Consumido na
  // primeira mensagem que o usuário enviar. Só faz efeito quando a rota vem
  // acompanhada de ?task=... (super_agent_cards da home).
  useEffect(() => {
    if (initialTask) {
      setSelectedTask(initialTask);
    }
    // Limpa ?agent e ?task da URL após aplicar — evita que um reload
    // desse chat crie outra conversa nova toda vez.
    if (initialTask || initialAgent) {
      navigate({
        search: {
          chatId: forceChatId,
          messageId: highlightId,
          module: initialModule,
          agent: undefined,
          task: undefined,
        } as any,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTask, initialAgent]);


  const [showModuleSelector, setShowModuleSelector] = useState(false);
  const [moduleOpen, setModuleOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [pendingModuleFromUrl, setPendingModuleFromUrl] = useState<string | null>(initialModule ?? null);
  const [forceShowChat, setForceShowChat] = useState(false);


  // Se não houver mensagens e o usuário for nutricionista, mostra o seletor inicial
  useEffect(() => {
    if (messages.length === 0 && !pendingModuleFromUrl && role === "nutri" && !thinking) {
      setShowModuleSelector(true);
    } else if (messages.length > 0) {
      setShowModuleSelector(false);
    }
  }, [messages.length, pendingModuleFromUrl, role, thinking]);

  const patientProfile = useMemo(() => {
    return filters.publico === "gestante"
      ? "gestante"
      : filters.publico === "adulto" && filters.sexo === "feminino"
      ? "adulto_feminino"
      : filters.publico === "adulto" && filters.sexo === "masculino"
      ? "adulto_masculino"
      : "";
  }, [filters.publico, filters.sexo]);

  useEffect(() => {
    // Só executa quando:
    // 1. Tem módulo pendente da URL
    if (!pendingModuleFromUrl) return;
    // 2. Os agentes já carregaram (evita resolver com lista vazia)
    if (loadingAgents) return;
    // 3. O paciente já foi carregado (evita resolver com profile vazio
    //    e cair no fallback errado, ex: exam_masculino para uma gestante)
    if (!patient) return;

    const agent = getAgentForCard(
      pendingModuleFromUrl,
      patientProfile,
      patient?.pregnancy_type
    );

    if (agent) {
      setAgentType(agent.agent_id);
      setShowModuleSelector(false);
    }

    // Limpa o módulo pendente para não executar novamente
    setPendingModuleFromUrl(null);

    // Limpa o ?module da URL
    navigate({
      search: {
        chatId: forceChatId,
        messageId: highlightId,
        module: undefined
      } as any
    });
  }, [pendingModuleFromUrl, patientProfile, patient, loadingAgents, getAgentForCard, setAgentType, navigate]);

  useEffect(() => {
    const patientProfile =
      filters.publico === "gestante"
        ? "gestante"
        : filters.publico === "adulto" && filters.sexo === "feminino"
        ? "adulto_feminino"
        : filters.publico === "adulto" && filters.sexo === "masculino"
        ? "adulto_masculino"
        : "";

    setContext({
      patient_sex: filters.sexo ?? "",
      patient_profile: patientProfile,
      gestante_tipo: filters.publico === "gestante" && filters.gestanteTipo
        ? (filters.gestanteTipo === "monofetal" ? "Monofetal" : "Gemelar")
        : "",
      gestante_periodo: filters.publico === "gestante" && filters.gestantePeriodo
        ? ({ "1t": "1º Trimestre", "2t": "2º Trimestre", "3t": "3º Trimestre" } as const)[filters.gestantePeriodo]
        : "",
      fase_ciclo: faseCicloToInput(filters),
    });
  }, [filters, setContext]);

  const isExamAgent = agentType?.startsWith("exam_");
  const assistantMessages = messages.filter(m => m.role === "assistant");
  const isFirstExamResponse =
    isExamAgent &&
    !thinking &&
    messages.length > 0 &&
    messages[messages.length - 1]?.role === "assistant";

  // Última mensagem do assistente com formulações sugeridas (handoff pendente).
  // Só mostramos o card sticky enquanto não houver mensagem do usuário depois dela.
  const pendingFormulacoes = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role === "user") return null;
      if (m.role === "assistant" && m.structured_data?.formulacoes_sugeridas) {
        return { id: m.id, payload: m.structured_data.formulacoes_sugeridas };
      }
    }
    return null;
  }, [messages]);

  // Reset forceShowChat when agent changes or when new messages arrive
  useEffect(() => {
    setForceShowChat(false);
  }, [agentType, messages.length]);

  // patientProfile useMemo moved up to be available for the pendingModule logic

  const [confirmNewChatOpen, setConfirmNewChatOpen] = useState(false);

  const handleNewChat = useCallback(async () => {
    if (thinking) return;
    if (messages.length > 0) {
      setConfirmNewChatOpen(true);
      return;
    }
    await resetChat();
  }, [thinking, messages.length, resetChat]);

  const confirmNewChat = useCallback(async () => {
    setConfirmNewChatOpen(false);
    // NÃO resetar filtros: eles refletem o perfil do paciente (sexo/gestante/trimestre)
    // e não mudam entre conversas. Resetar aqui causava roteamento errado de exames
    // (perfil vazio caía no agente masculino).
    await resetChat();
  }, [resetChat]);

  const wrappedSend = useCallback(
    async (text: string, files: File[]) => {
      // Garante que o painel de módulos não esconda a animação "Lumma está pensando…"
      setShowModuleSelector(false);

      const currentAgent = agents.find(a => a.agent_id === agentType);
      const trigger = currentAgent?.card_trigger;
      const placeholderByKey: Record<string, string> = {
        composicao_corporal_foto: "Analise a composição corporal a partir da foto anexada do paciente.",
        estimativa_refeicao_foto: "Analise a foto do prato de comida anexada e estime porções, calorias e macronutrientes (proteína, carboidrato, gordura) de cada alimento visível.",
        nutricao_visual: "Analise a imagem anexada e gere a orientação nutricional visual correspondente.",
      };
      // Super Agente: a intenção real vem de selectedTask (task_key), não do card_trigger do agente.
      const fallback = "Analise o exame anexado.";
      const filePlaceholder =
        (selectedTask && placeholderByKey[selectedTask]) ||
        (trigger && placeholderByKey[trigger]) ||
        fallback;

      const finalChatText = text?.trim() || (files.length > 0 ? filePlaceholder : "");
      await sendMessage(finalChatText, files);
    },
    [sendMessage, agents, agentType, selectedTask],
  );

  const handleGenerateRecipe = useCallback(
    (payload: NonNullable<NonNullable<typeof messages[number]["structured_data"]>["formulacoes_sugeridas"]>) => {
      // Se o agente atual é um Super Agente, permanece nele e apenas troca a
      // tarefa interna para "production" (Produção e Formulações SA),
      // evitando o handoff para o agente comum de formulações.
      const currentAgent = agents.find(a => a.agent_id === agentType);
      const isSuper = currentAgent?.is_super_agent === true;

      let targetAgentId: string | null = null;
      let targetTaskKey: string | undefined;

      if (isSuper) {
        const productionTask = superAgentTasks.find(
          t => t.agent_id === currentAgent!.agent_id && t.task_key === "production",
        );
        if (productionTask) {
          targetAgentId = currentAgent!.agent_id;
          targetTaskKey = productionTask.task_key;
        }
      }

      if (!targetAgentId) {
        const target = getAgentForCard("plano_alimentar", patientProfile, patient?.pregnancy_type);
        if (!target) {
          console.warn("[handoff] Nenhum agente de formulações configurado.");
          return;
        }
        targetAgentId = target.agent_id;
      }

      const gestantePeriodo = filters.publico === "gestante" && filters.gestantePeriodo
        ? ({ "1t": "1º Trimestre", "2t": "2º Trimestre", "3t": "3º Trimestre" } as const)[filters.gestantePeriodo]
        : "";
      const gestanteTipo = filters.publico === "gestante" && filters.gestanteTipo
        ? (filters.gestanteTipo === "monofetal" ? "Monofetal" : "Gemelar")
        : "";
      const examContextPayload = {
        resumo_exame: payload.resumo_exame ?? "",
        formulacoes_sugeridas: payload.formulacoes,
        alertas: payload.alertas ?? [],
        patient_profile: patientProfile,
        patient_sex: filters.sexo ?? "",
        gestante_tipo: gestanteTipo,
        gestante_periodo: gestantePeriodo,
        origem_agente: agentType ?? "",
        origem_task: selectedTask ?? "",
      };
      void sendHandoff(
        targetAgentId,
        { exam_context: JSON.stringify(examContextPayload) },
        "Gere a receita pronta para a farmácia a partir das formulações sugeridas no exam_context, mantendo nomes, ativos e doses exatos.",
        targetTaskKey ? { selectedTask: targetTaskKey, displayText: "Gerar receita" } : undefined,
      );
    },
    [agentType, agents, superAgentTasks, filters, patient?.pregnancy_type, patientProfile, selectedTask, sendHandoff, getAgentForCard],
  );

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any)
        .from("patients")
        .select("id, name, birth_date, gender, avatar_url, is_pregnant, gestational_weeks, pregnancy_type, menstrual_cycle_phase")
        .eq("id", patientId)
        .maybeSingle();
      setPatient(data as PatientCtx | null);
    })();
  }, [patientId]);

  // Auto-popular filtros do banco
  useEffect(() => {
    if (!patient) return;

    // Sexo
    const sexo: ExamFilters["sexo"] = 
      patient.gender === "male" 
        ? "masculino" 
        : patient.gender === "female" 
        ? "feminino" 
        : null;

    // Gestante
    const isPregnant = 
      patient.gender === "female" && 
      patient.is_pregnant === true;

    // Público
    const publico: ExamFilters["publico"] = isPregnant ? "gestante" : "adulto";

    // Tipo de gestação
    const gestanteTipo: ExamFilters["gestanteTipo"] = patient.pregnancy_type === "multiple" 
      ? "gemelar" 
      : "monofetal";

    // Trimestre calculado automaticamente
    const weeks = patient.gestational_weeks ?? 0;
    const gestantePeriodo: ExamFilters["gestantePeriodo"] = 
      weeks <= 12 ? "1t" : 
      weeks <= 27 ? "2t" : "3t";

    // Fase do ciclo (a partir do cadastro do paciente)
    const FASE_VALIDAS = ["folicular", "ovulatoria", "lutea", "nao_menstrua", "menopausa", "nao_sei"] as const;
    const stored = patient.menstrual_cycle_phase ?? null;
    const faseCiclo: ExamFilters["faseCiclo"] =
      stored && (FASE_VALIDAS as readonly string[]).includes(stored)
        ? (stored as ExamFilters["faseCiclo"])
        : sexo === "feminino" && !isPregnant
        ? "nao_sei"
        : null;

    // Seta os filtros que alimentam o metaRef
    setFilters(prev => ({
      ...prev,
      sexo: prev.sexo ?? sexo,
      publico: prev.publico ?? publico,
      gestanteTipo: isPregnant ? (prev.gestanteTipo ?? gestanteTipo) : prev.gestanteTipo,
      gestantePeriodo: isPregnant ? (prev.gestantePeriodo ?? gestantePeriodo) : prev.gestantePeriodo,
      faseCiclo: prev.faseCiclo ?? faseCiclo,
    }));
  }, [patient]);

  const reloadExams = useCallback(async () => {
    const { data } = await (supabase as any)
      .from("patient_exams")
      .select("id, file_name, file_path, mime_type, created_at, exam_date")
      .eq("patient_id", patientId)
      .order("exam_date", { ascending: false })
      .limit(20);
    setExams((data as ExamItem[]) ?? []);
  }, [patientId]);

  useEffect(() => {
    reloadExams();
  }, [reloadExams, messages.length]);

  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any)
        .from("patient_exam_results")
        .select(
          "marker_name, marker_value, marker_value_raw, marker_unit, reference_value, classification, analysis, measured_at",
        )
        .eq("patient_id", patientId)
        .order("measured_at", { ascending: true });
      setReportMarkers((data as any[]) ?? []);
    })();
  }, [patientId, messages.length]);

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `Laudo-${patient?.name ?? "paciente"}`,
  });

  const handleExportConversation = useReactToPrint({
    contentRef: conversationRef,
    documentTitle: `Conversa-${patient?.name ?? "paciente"}-${format(new Date(), "dd-MM-yyyy")}`,
  });

  const age = patient?.birth_date
    ? differenceInYears(new Date(), new Date(patient.birth_date))
    : null;

  const initialLoading =
    (patient === null || chatId === null) &&
    messages.length === 0 &&
    uploadProgress.length === 0 &&
    !thinking;

  if (initialLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[#f5f5f0] overflow-hidden">
        <div className="flex flex-col items-center gap-4 px-6 text-center">
          <img src={lummaSymbol} alt="Lumma" className="h-14 w-14 animate-spin" />
          <div>
            <p className="text-lg font-medium animate-pulse bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] bg-clip-text text-transparent">
              Carregando dados e conversas do paciente…
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Aguarde um instante enquanto a Lumma prepara o atendimento.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const closeMenu = () => setMenuOpen(false);

  const SidebarContent = (
    <>
      <div className="px-5 py-4 border-b">
        <Link
          to="/app/patients"
          onClick={closeMenu}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" /> Pacientes
        </Link>
        <div className="mt-3 flex items-center gap-3">
          <Avatar className="h-10 w-10 ring-2 ring-[#e89bcf]/30">
            {patient?.avatar_url && <AvatarImage src={patient.avatar_url} alt={patient.name} />}
            <AvatarFallback className="bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] text-white text-sm font-medium">
              {patient?.name?.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase() ?? "?"}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="font-medium truncate">
              {patient?.name ? `Atendimento de ${patient.name}` : "Carregando paciente…"}
            </div>
            <div className="text-xs text-muted-foreground">
              {age !== null ? `${age} anos` : "—"}
              {patient?.is_pregnant ? " · Gestante" : patient?.gender && ` · ${patient.gender === "female" ? "Feminino" : patient.gender === "male" ? "Masculino" : "Outro"}`}
              {patient?.is_pregnant && patient?.gestational_weeks !== undefined && ` · ${patient.gestational_weeks} sem`}
            </div>
          </div>
        </div>
      </div>

      {role === "nutri" && (
        <div className="px-3 pt-3">
          <Button
            onClick={() => { closeMenu(); handleNewChat(); }}
            disabled={thinking || !chatId}
            className="w-full justify-start rounded-full gap-2 bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] text-white hover:opacity-90 shadow-sm h-10"
          >
            <Plus className="h-4 w-4" />
            Novo Chat
          </Button>
        </div>
      )}

      <div className="px-3 pt-2 flex flex-col gap-1">
        <div onClick={closeMenu}>
          <PatientChatHistory patientId={patientId} currentChatId={chatId} readOnly={readOnly} />
        </div>
        <Button
          onClick={() => { closeMenu(); handleExportConversation(); }}
          disabled={!branding || messages.length === 0}
          variant="ghost"
          className="w-full justify-start gap-2 h-10 rounded-lg"
        >
          <MessageSquare className="h-4 w-4" />
          Exportar conversa
        </Button>
        <Button
          onClick={() => { closeMenu(); handlePrint(); }}
          disabled={!branding || reportMarkers.length === 0}
          variant="ghost"
          className="w-full justify-start gap-2 h-10 rounded-lg"
        >
          <Stethoscope className="h-4 w-4" />
          Gerar laudo clínico
        </Button>
        <Link
          to="/app/evolution/$patientId"
          params={{ patientId }}
          onClick={closeMenu}
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-muted/50 transition min-h-10"
        >
          <TrendingUp className="h-4 w-4 text-[#e8a04c]" />
          Evolução clínica
          <span className="ml-auto text-[10px] text-muted-foreground">gráficos</span>
        </Link>
      </div>

      <div className="px-3 py-3 mt-2 border-t flex-1 min-h-0 flex flex-col">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground px-3 mb-2">
          Histórico de exames
        </div>
        <div className="overflow-y-auto flex-1">
          <ExamHistoryList exams={exams} onChanged={reloadExams} />
        </div>
      </div>
    </>
  );

  return (
    <div className="flex h-screen w-full overflow-hidden bg-gradient-to-br from-[#f3e8ff] via-[#e0f2fe] to-[#fce7f3] transition-colors duration-500">
      {/* Sheet — Sidebar acessível via hambúrguer */}
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="p-0 w-80 max-w-[85vw] flex flex-col bg-white">
          {SidebarContent}
        </SheetContent>
      </Sheet>

      {/* Conteúdo principal */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {showModuleSelector && (
          <div className="absolute top-4 left-6 z-30 flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 rounded-full bg-white/40 backdrop-blur-md border border-white/60 hover:bg-white/60"
              onClick={() => setMenuOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </Button>
            <Link
              to="/app/patients"
              className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground bg-white/40 backdrop-blur-md px-3 py-2 rounded-full border border-white/60 transition-all"
            >
              <ArrowLeft className="h-3 w-3" /> Pacientes
            </Link>
          </div>
        )}

        {!showModuleSelector && (
          <header className="sticky top-0 z-20 shrink-0 px-3 sm:px-6 py-2 border-b border-white/40 bg-white/70 backdrop-blur-md flex items-center gap-3">
          <Button 
            variant="ghost" 
            size="icon" 
            className="shrink-0 h-10 w-10" 
            onClick={() => setMenuOpen(true)}
            aria-label="Abrir menu"
          >
            <Menu className="h-5 w-5" />
          </Button>
          
          <Link
            to="/app/patients"
            className="hidden sm:inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground shrink-0"
          >
            <ArrowLeft className="h-3 w-3" /> Pacientes
          </Link>
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
            <Avatar className="h-9 w-9 shrink-0">
              {patient?.avatar_url && <AvatarImage src={patient.avatar_url} alt={patient.name} />}
              <AvatarFallback className="bg-gradient-to-br from-[#e8a04c] to-[#e89bcf] text-white text-xs">
                {patient?.name?.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase() ?? "?"}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-800 truncate leading-tight">
                {patient?.name ?? "Carregando paciente…"}
              </p>
              <p className="text-[11px] text-slate-500 leading-tight truncate">
                {age !== null ? `${age} anos` : "—"}
                {patient?.gender && ` · ${patient.gender === "female" ? "Feminino" : patient.gender === "male" ? "Masculino" : "Outro"}`}
                {patient?.is_pregnant && (
                  <>
                    <span className="text-[#7c3aed] font-medium"> · 🤰 Gestante</span>
                    {patient.gestational_weeks !== undefined && (
                      <span>
                        {` · ${patient.gestational_weeks} sem (${
                          patient.gestational_weeks <= 12 ? "1ºT" : 
                          patient.gestational_weeks <= 27 ? "2ºT" : "3ºT"
                        })`}
                      </span>
                    )}
                    {patient.pregnancy_type === 'multiple' && " · Gemelar"}
                  </>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {role === "nutri" && (
              <Button
                onClick={handleNewChat}
                disabled={thinking}
                className="h-9 rounded-full bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] text-white hover:opacity-90 px-3 sm:px-4 text-sm"
              >
                <Plus className="h-4 w-4 sm:mr-1" />
                <span className="hidden sm:inline">Nova Conversa</span>
              </Button>
            )}
            <PatientChatHistory patientId={patientId} currentChatId={chatId} readOnly={readOnly} />
            <Button
              onClick={handleExportConversation}
              disabled={!branding || messages.length === 0}
              variant="ghost"
              size="sm"
              className="h-9 w-9 sm:h-9 sm:w-auto rounded-lg sm:gap-1.5 p-0 sm:px-3"
            >
              <MessageSquare className="h-4 w-4" />
              <span className="hidden lg:inline">Exportar conversa</span>
            </Button>
            <Button
              onClick={handlePrint}
              disabled={!branding || reportMarkers.length === 0}
              variant="ghost"
              size="sm"
              title="Gera o laudo clínico formal com marcadores do paciente"
              className="h-9 w-9 sm:h-9 sm:w-auto rounded-lg sm:gap-1.5 p-0 sm:px-3"
            >
              <Stethoscope className="h-4 w-4" />
              <span className="hidden lg:inline">Laudo clínico</span>
            </Button>
            <Link
              to="/app/evolution/$patientId"
              params={{ patientId }}
              className="inline-flex items-center sm:gap-1.5 h-9 w-9 sm:h-9 sm:w-auto rounded-lg sm:px-3 text-sm hover:bg-muted/50 transition justify-center"
            >
              <TrendingUp className="h-4 w-4 text-[#e8a04c]" />
              <span className="hidden lg:inline">Evolução</span>
            </Link>
          </div>
          {error && (
            <p className="text-[11px] sm:text-xs text-rose-600 line-clamp-1 max-w-[200px] shrink-0">{error}</p>
          )}
          </header>
        )}

        <main className="relative flex-1 min-h-0 overflow-hidden flex flex-col">
          <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden">
            {(!thinking && !agentType && !pendingModuleFromUrl && (showModuleSelector || (messages.length === 0 && role === "nutri"))) ? (
              <div className="min-h-0 flex-1 overflow-y-auto">
                <ChatIntentPanel
                  filters={filters}
                  onChange={setFilters}
                  userName={profile?.full_name?.split(" ")[0]}
                  agentType={agentType as any}
                  onAgentChange={(t) => {
                    setAgentType(t);
                    setShowModuleSelector(false);
                  }}
                />
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto flex flex-col min-h-0">
                <InactiveChatBanner chatId={chatId} onNewChat={handleNewChat} />
                <ChatMessageList 
                  messages={messages} 
                  thinking={thinking} 
                  thinkingMode={thinkingMode} 
                  highlightId={highlightId} 
                  isStreaming={thinking}
                  agentType={agentType}
                  patient={patient}
                />

              </div>
            )}
          </div>
        </main>

        <div className="shrink-0 px-3 sm:px-4 pb-4 sm:pb-6 pt-3">
          <div className="mx-auto w-full max-w-3xl">
            {(() => {
              const currentAgent = agents.find(a => a.agent_id === agentType);
              if (!currentAgent?.is_super_agent) return null;
              const taskLabel = selectedTask
                ? (superAgentTasks.find(t => t.agent_id === currentAgent.agent_id && t.task_key === selectedTask)?.label ?? selectedTask)
                : null;
              return (
                <div className="mb-2 flex items-center gap-2 rounded-2xl border border-[#e8a04c]/30 bg-gradient-to-br from-[#e8a04c]/10 to-[#e89bcf]/10 px-3 py-2 text-xs text-foreground/80 animate-in fade-in slide-in-from-bottom-1">
                  <Sparkles className="h-3.5 w-3.5 text-[#e8a04c] shrink-0" />
                  <span className="font-semibold text-foreground">Super Agente ativo:</span>
                  <span className="truncate">{currentAgent.label}</span>
                  {taskLabel && (
                    <>
                      <span className="text-foreground/30">·</span>
                      <span className="truncate">
                        <span className="text-foreground/60">Tarefa:</span> <span className="font-medium">{taskLabel}</span>
                      </span>
                    </>
                  )}
                </div>
              );
            })()}
            {pendingFormulacoes && !readOnly && (
              <div className="mb-2 flex items-center gap-3 rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 to-white px-4 py-3 shadow-sm animate-in fade-in slide-in-from-bottom-1">
                <div className="shrink-0 h-9 w-9 rounded-lg bg-violet-100 flex items-center justify-center">
                  <Sparkles className="h-4 w-4 text-violet-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-violet-900">
                    {pendingFormulacoes.payload.formulacoes.length} formulação(ões) sugerida(s)
                  </div>
                  <div className="text-xs text-violet-700/80">
                    Envie ao agente de formulações para gerar a receita pronta para a farmácia.
                  </div>
                </div>
                <Button
                  size="sm"
                  className="bg-violet-600 hover:bg-violet-700 text-white shrink-0"
                  onClick={() => handleGenerateRecipe(pendingFormulacoes.payload)}
                  disabled={thinking}
                >
                  Gerar receita
                </Button>
              </div>
            )}
            {readOnly ? (
              <div className="flex items-center justify-center gap-2 rounded-2xl border border-amber-200 bg-amber-50/80 backdrop-blur-sm px-4 py-3 text-xs text-amber-800 text-center">
                <Eye className="h-3.5 w-3.5 shrink-0" />
                Modo auditoria — você está visualizando esta conversa em modo somente leitura.
              </div>
            ) : (
              <>
                {isFirstExamResponse && !forceShowChat ? (
                  <div className="pb-2">
                    <NextStepsSuggestion
                      hideFormulacoes={!!pendingFormulacoes}
                      onSelectModule={(trigger) => {
                        if (!trigger) {
                          setForceShowChat(true);
                        } else {
                          const bestAgent = getAgentForCard(trigger, patientProfile, patient?.pregnancy_type);
                          if (bestAgent) {
                            setAgentType(bestAgent.agent_id);
                          } else if (trigger === "exames_de_sangue") {
                            toast.error("Perfil do paciente não definido. Confirme sexo/gestação antes de analisar o exame.");
                          }
                        }
                      }}
                    />
                  </div>
                ) : (
                  <>
                    {(() => {
                      const currentAgent = agents.find(a => a.agent_id === agentType);
                      const cardTrigger = currentAgent?.card_trigger;

                      // Agrupar agentes por card_trigger únicos
                      const cardOptions = Array.from(
                        new Map(
                          agents
                            .filter(a => a.is_active && a.card_trigger)
                            .map(a => [a.card_trigger, {
                              trigger: a.card_trigger as string,
                              label: CARD_LABELS[a.card_trigger as string] || a.card_trigger,
                              icon: CARD_ICONS[a.card_trigger as string] || Sparkles,
                              color: CARD_COLORS[a.card_trigger as string] || "#e8a04c"
                            }])
                        ).values()
                      );

                      const moduleSelector = (
                        <Popover open={moduleOpen} onOpenChange={setModuleOpen}>
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              className={cn(
                                "inline-flex items-center gap-1.5 rounded-full transition group max-w-full",
                                !agentType
                                  ? "bg-yellow-400 border border-yellow-500 text-black font-bold px-4 py-1.5 text-xs animate-pulse shadow-md hover:bg-yellow-300"
                                  : "bg-muted/50 hover:bg-muted text-foreground px-3 py-1 text-[11px] font-medium"
                              )}
                              title="Trocar de módulo"
                            >
                              {(() => {
                                const isSuperActive = !!currentAgent?.is_super_agent;
                                const activeTaskLabel = isSuperActive && selectedTask
                                  ? superAgentTasks.find(t => t.agent_id === currentAgent!.agent_id && t.task_key === selectedTask)?.label
                                  : null;
                                const label = isSuperActive
                                  ? `${currentAgent?.label ?? "Super Agente"}${activeTaskLabel ? ` · ${activeTaskLabel}` : ""}`
                                  : (cardTrigger && CARD_LABELS[cardTrigger]) || (agentType ? currentAgent?.label : "Selecione uma tarefa");
                                const Icon = isSuperActive ? Sparkles : ((cardTrigger && CARD_ICONS[cardTrigger]) || Sparkles);
                                if (loadingAgents) return <span>Carregando...</span>;
                                return !agentType ? (
                                  <span className="flex items-center gap-2 truncate">
                                    <span>⚠️</span>
                                    <span className="truncate">{label}</span>
                                  </span>
                                ) : (
                                  <>
                                    <Icon className="h-3.5 w-3.5 text-[#e8a04c] shrink-0" />
                                    <span className="truncate">{label}</span>
                                  </>
                                );
                              })()}
                              <ChevronDown className={cn("shrink-0", !agentType ? "h-4 w-4 text-black" : "h-3 w-3 text-muted-foreground/60 group-hover:text-muted-foreground")} />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent
                            side="top"
                            align="center"
                            className="w-64 p-2 rounded-2xl bg-white/90 backdrop-blur-xl border-white/60 shadow-2xl animate-in fade-in slide-in-from-bottom-2"
                          >
                            <div className="space-y-1">
                              {cardOptions.map((opt, idx) => {
                                const Icon = opt.icon;
                                const iconColor = opt.color;
                                const isActive = cardTrigger === opt.trigger;
                                const bestForCard = getAgentForCard(opt.trigger, patientProfile, patient?.pregnancy_type);
                                const hasSession = !!(bestForCard && activeAgents?.includes(bestForCard.agent_id));
                                return (
                                  <div key={opt.trigger}>
                                    {idx === 3 && <div className="my-1 border-t border-slate-100" />}
                                    <button
                                      onClick={() => {
                                        const bestAgent = getAgentForCard(opt.trigger, patientProfile, patient?.pregnancy_type);
                                        if (bestAgent) {
                                          setAgentType(bestAgent.agent_id);
                                          setSelectedTask(null);
                                          setModuleOpen(false);
                                        } else if (opt.trigger === "exames_de_sangue") {
                                          setModuleOpen(false);
                                          toast.error("Perfil do paciente não definido. Confirme sexo/gestação antes de analisar o exame.");
                                        }
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
                                        <Icon className="h-3.5 w-3.5" style={{ color: iconColor }} />
                                      </div>
                                      <span className="flex-1 text-left flex items-center gap-2">
                                        {opt.label}
                                        {hasSession && !isActive && (
                                          <span
                                            className="h-1.5 w-1.5 rounded-full bg-emerald-500"
                                            title="Sessão ativa — retomar de onde parou"
                                          />
                                        )}
                                      </span>
                                      {isActive && <div className="h-1.5 w-1.5 rounded-full bg-[#e8a04c]" />}
                                    </button>
                                  </div>
                                );
                              })}

                              {/* Super Agentes — cards de tarefa vinculados a um super_agent */}
                              {(() => {
                                const activeSuperCards = superAgentCards
                                  .filter(c => c.is_active)
                                  .map(card => {
                                    const task = superAgentTasks.find(t => t.id === card.task_id && t.is_active);
                                    if (!task) return null;
                                    const agent = agents.find(a => a.agent_id === task.agent_id && a.is_super_agent && a.is_active);
                                    if (!agent) return null;
                                    return { card, task, agent };
                                  })
                                  .filter((x): x is { card: typeof superAgentCards[number]; task: typeof superAgentTasks[number]; agent: typeof agents[number] } => x !== null);

                                if (activeSuperCards.length === 0) return null;

                                return (
                                  <>
                                    <div className="my-1.5 border-t border-slate-100" />
                                    <div className="px-2 pt-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-foreground/40 flex items-center gap-1.5">
                                      <Sparkles className="h-2.5 w-2.5 text-[#e8a04c]" />
                                      Super Agentes
                                    </div>
                                    {activeSuperCards.map(({ card, task, agent }) => {
                                      const isActive = agentType === agent.agent_id && selectedTask === task.task_key;
                                      return (
                                        <button
                                          key={card.id}
                                          onClick={() => {
                                            setAgentType(agent.agent_id);
                                            setSelectedTask(task.task_key);
                                            setModuleOpen(false);
                                          }}
                                          className={cn(
                                            "w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium transition-all group/opt",
                                            isActive
                                              ? "bg-gradient-to-r from-[#e8a04c]/15 to-[#e89bcf]/15 text-foreground border border-[#e8a04c]/30"
                                              : "text-foreground/70 hover:bg-white hover:text-foreground hover:shadow-sm"
                                          )}
                                        >
                                          <div className={cn(
                                            "p-1.5 rounded-lg transition-colors",
                                            isActive ? "bg-white shadow-sm" : "bg-gradient-to-br from-[#e8a04c]/10 to-[#e89bcf]/10 group-hover/opt:bg-white"
                                          )}>
                                            <Sparkles className="h-3.5 w-3.5 text-[#e8a04c]" />
                                          </div>
                                          <span className="flex-1 text-left truncate">{card.label}</span>
                                          {isActive && <div className="h-1.5 w-1.5 rounded-full bg-[#e8a04c]" />}
                                        </button>
                                      );
                                    })}
                                  </>
                                );
                              })()}
                            </div>
                          </PopoverContent>
                        </Popover>
                      );

                      const isSuperActive = !!currentAgent?.is_super_agent;
                      const tasksForCurrentSuper = isSuperActive
                        ? superAgentTasks.filter(t => t.agent_id === currentAgent!.agent_id && t.is_active).sort((a, b) => a.sort_order - b.sort_order)
                        : [];
                      const activeTaskObj = isSuperActive && selectedTask
                        ? tasksForCurrentSuper.find(t => t.task_key === selectedTask)
                        : null;

                      const taskSelector = isSuperActive && tasksForCurrentSuper.length > 0 ? (
                        <Popover open={taskOpen} onOpenChange={setTaskOpen}>
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              className={cn(
                                "inline-flex items-center gap-1.5 rounded-full transition group max-w-full px-3 py-1 text-[11px] font-medium border",
                                !selectedTask
                                  ? "bg-amber-50 border-amber-300 text-amber-900 animate-pulse"
                                  : "bg-gradient-to-r from-[#e8a04c]/10 to-[#e89bcf]/10 border-[#e8a04c]/30 text-foreground hover:from-[#e8a04c]/15 hover:to-[#e89bcf]/15"
                              )}
                              title="Escolher tarefa do Super Agente"
                            >
                              <Sparkles className="h-3.5 w-3.5 text-[#e8a04c] shrink-0" />
                              <span className="truncate">
                                {activeTaskObj ? activeTaskObj.label : "Escolher tarefa"}
                              </span>
                              <ChevronDown className="shrink-0 h-3 w-3 text-muted-foreground/60 group-hover:text-muted-foreground" />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent
                            side="top"
                            align="center"
                            className="w-64 p-2 rounded-2xl bg-white/90 backdrop-blur-xl border-white/60 shadow-2xl animate-in fade-in slide-in-from-bottom-2"
                          >
                            <div className="px-2 pt-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-foreground/40 flex items-center gap-1.5">
                              <Sparkles className="h-2.5 w-2.5 text-[#e8a04c]" />
                              Tarefas · {currentAgent?.label}
                            </div>
                            <div className="space-y-1">
                              {tasksForCurrentSuper.map(t => {
                                const isActive = selectedTask === t.task_key;
                                const TaskIcon = getAgentIcon((t as any).icon);
                                return (
                                  <button
                                    key={t.id}
                                    onClick={() => {
                                      setSelectedTask(t.task_key);
                                      setTaskOpen(false);
                                    }}
                                    className={cn(
                                      "w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium transition-all group/opt",
                                      isActive
                                        ? "bg-gradient-to-r from-[#e8a04c]/15 to-[#e89bcf]/15 text-foreground border border-[#e8a04c]/30"
                                        : "text-foreground/70 hover:bg-white hover:text-foreground hover:shadow-sm"
                                    )}
                                  >
                                    <div className={cn(
                                      "p-1.5 rounded-lg transition-colors",
                                      isActive ? "bg-white shadow-sm" : "bg-gradient-to-br from-[#e8a04c]/10 to-[#e89bcf]/10 group-hover/opt:bg-white"
                                    )}>
                                      <TaskIcon className="h-3.5 w-3.5 text-[#e8a04c]" />
                                    </div>
                                    <span className="flex-1 text-left truncate">{t.label}</span>
                                    {isActive && <div className="h-1.5 w-1.5 rounded-full bg-[#e8a04c]" />}
                                  </button>
                                );
                              })}
                            </div>
                          </PopoverContent>
                        </Popover>
                      ) : null;

                      return (
                        <>
                          {agentType !== "exam" && examContext && null}

                          <ChatInput
                            onSubmit={wrappedSend}
                            disabled={thinking || !chatId || !agentType}
                            hasModule={!!agentType}
                            uploadProgress={uploadProgress}
                            onRemoveAttachment={removeUploadItem}
                            toolbarSlot={
                              <div className="flex items-center gap-2 flex-wrap min-w-0">
                                {/* Super Agente já vinculado (via card "Análise Completa"):
                                    esconde o seletor de módulo/agente. O usuário só troca
                                    a TAREFA dentro do super agente, nunca o agente em si. */}
                                {!isSuperActive && moduleSelector}
                                {taskSelector}
                              </div>
                            }
                          />

                        </>
                      );
                    })()}



                  </>
                )}
              </>
            )}
          </div>
        </div>

        {/* Off-screen printable layout for "Gerar Laudo PDF" */}
        <div
          style={{ position: "fixed", left: "-10000px", top: 0, pointerEvents: "none" }}
          aria-hidden
        >
          <div ref={printRef}>
            {branding && patient && reportMarkers.length > 0 && (
              <PatientReportPDF
                branding={branding}
                patient={{
                  name: patient.name,
                  birth_date: patient.birth_date,
                  gender: patient.gender,
                }}
                markers={reportMarkers as any}
              />
            )}
          </div>
          <div ref={conversationRef}>
            {branding && patient && messages.length > 0 && (
              <ChatConversationPDF
                branding={branding}
                patient={{
                  name: patient.name,
                  birth_date: patient.birth_date,
                  gender: patient.gender,
                }}
                messages={messages}
              />
            )}
          </div>
        </div>
      </div>

      <AlertDialog open={confirmNewChatOpen} onOpenChange={setConfirmNewChatOpen}>
        <AlertDialogContent className="max-w-md border-0 shadow-xl rounded-2xl overflow-hidden p-0">
          <div className="h-1 w-full bg-gradient-to-r from-[#e8a04c] to-[#e89bcf]" />
          <div className="p-6">
            <AlertDialogHeader>
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-[#e8a04c]/15 to-[#e89bcf]/15 ring-1 ring-[#e89bcf]/25">
                <Sparkles className="h-6 w-6 text-transparent bg-clip-text" style={{ stroke: "url(#lumma-grad)" }} />
                <svg width="0" height="0" className="absolute">
                  <defs>
                    <linearGradient id="lumma-grad" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor="#e8a04c" />
                      <stop offset="100%" stopColor="#e89bcf" />
                    </linearGradient>
                  </defs>
                </svg>
              </div>
              <AlertDialogTitle className="text-center text-lg font-semibold">
                Iniciar uma nova consulta?
              </AlertDialogTitle>
              <AlertDialogDescription className="text-center text-sm text-muted-foreground leading-relaxed">
                A conversa atual será encerrada e arquivada no histórico do paciente. Você poderá consultá-la a qualquer momento.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="mt-6 flex-row justify-center gap-3 sm:justify-center">
              <AlertDialogCancel className="rounded-full px-6 mt-0">
                Cancelar
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={confirmNewChat}
                className="rounded-full px-6 bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] text-white hover:opacity-90 border-0"
              >
                Iniciar nova consulta
              </AlertDialogAction>
            </AlertDialogFooter>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
