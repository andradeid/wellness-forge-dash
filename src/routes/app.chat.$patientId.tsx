import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ClipboardList, Download, Eye, FileDown, Menu, Plus, ShieldCheck, TrendingUp } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useReactToPrint } from "react-to-print";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useDifyChat } from "@/hooks/useDifyChat";
import { ChatMessageList } from "@/components/chat/ChatMessageList";
import { ChatInput } from "@/components/chat/ChatInput";
import { ChatIntentPanel, emptyFilters, faseCicloToInput, filtersToContext, type ExamFilters } from "@/components/chat/ChatIntentPanel";
import { ExamHistoryList, type ExamItem } from "@/components/chat/ExamHistoryList";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useBrandingProfile } from "@/hooks/useBrandingProfile";
import { PatientReportPDF } from "@/components/branding/PatientReportPDF";
import { ChatConversationPDF } from "@/components/chat/ChatConversationPDF";
import { PatientChatHistory } from "@/components/chat/PatientChatHistory";
import { format, differenceInYears } from "date-fns";
import lummaSymbol from "@/assets/lumma-symbol.svg";

export const Route = createFileRoute("/app/chat/$patientId")({
  validateSearch: (s: Record<string, unknown>) => ({
    chatId: typeof s.chatId === "string" ? s.chatId : undefined,
    messageId: typeof s.messageId === "string" ? s.messageId : undefined,
    module: typeof s.module === "string" ? s.module : undefined,
  }),
  component: ChatPage,
});

const AGENT_BADGES: Record<string, { icon: string; label: string }> = {
  exam: { icon: "🔬", label: "Analisando Exame" },
  production: { icon: "🥗", label: "Plano & Formulação" },
  reasoning: { icon: "🤔", label: "Pergunta Clínica" },
};

interface PatientCtx {


  id: string;
  name: string;
  birth_date: string | null;
  gender: string | null;
  avatar_url: string | null;
}

function ChatPage() {
  const { patientId } = Route.useParams();
  const { chatId: forceChatId, messageId: highlightId, module: initialModule } = Route.useSearch();
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
  const { messages, thinking, thinkingMode, sendMessage, chatId, error, uploadProgress, resetChat, setContext, agentType, setAgentType, examContext } = useDifyChat(patientId, {
    readOnly,
    forceChatId: forceChatId ?? null,
  });
  const [showModuleSelector, setShowModuleSelector] = useState(false);

  // Se não houver mensagens e o usuário for nutricionista, mostra o seletor inicial
  useEffect(() => {
    if (messages.length === 0 && !initialModule && role === "nutri" && !thinking) {
      setShowModuleSelector(true);
    } else if (messages.length > 0) {
      setShowModuleSelector(false);
    }
  }, [messages.length, initialModule, role, thinking]);

  useEffect(() => {
    if (initialModule && ["exam", "production", "reasoning", "research"].includes(initialModule)) {
      setAgentType(initialModule);
      setShowModuleSelector(false);
      // Limpa o parâmetro da URL
      const url = new URL(window.location.href);
      url.searchParams.delete("module");
      window.history.replaceState({}, "", url.toString());
    }
  }, [initialModule, setAgentType]);

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

  const handleNewChat = useCallback(async () => {
    if (thinking) return;
    if (messages.length > 0 && !window.confirm("Iniciar uma nova consulta? A conversa atual será encerrada e arquivada no histórico.")) return;
    setFilters(emptyFilters());
    await resetChat();
  }, [thinking, messages.length, resetChat]);

  const wrappedSend = useCallback(
    async (text: string, files: File[]) => {
      // Garante que o painel de módulos não esconda a animação "Lumma está pensando…"
      setShowModuleSelector(false);
      const ctx = files.length > 0 ? filtersToContext(filters) : null;
      if (files.length > 0 && ctx) {
        // 1) Envia o exame primeiro e aguarda a resposta da Lumma
        const firstText = text?.trim() || "Analise o exame anexado.";
        await sendMessage(firstText, files);
        // 2) Só então envia as perguntas pré-selecionadas como segunda mensagem
        await sendMessage(ctx, []);
        return;
      }
      await sendMessage(text, files);
    },
    [filters, sendMessage],
  );

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any)
        .from("patients")
        .select("id, name, birth_date, gender, avatar_url")
        .eq("id", patientId)
        .maybeSingle();
      setPatient(data as PatientCtx | null);
    })();
  }, [patientId]);

  // Pré-popula sexo/público a partir da ficha do paciente, evitando que a Lumma
  // pergunte dados que já temos cadastrados (ex.: "está gestante?" para homem).
  useEffect(() => {
    if (!patient) return;
    setFilters((prev) => {
      const sexo: ExamFilters["sexo"] =
        prev.sexo ?? (patient.gender === "female" ? "feminino" : patient.gender === "male" ? "masculino" : null);
      const publico: ExamFilters["publico"] = prev.publico ?? (sexo ? "adulto" : null);
      return { ...prev, sexo, publico };
    });
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
              {patient?.gender && ` · ${patient.gender === "female" ? "Feminino" : patient.gender === "male" ? "Masculino" : "Outro"}`}
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
          <Download className="h-4 w-4" />
          Exportar Conversa
        </Button>
        <Button
          onClick={() => { closeMenu(); handlePrint(); }}
          disabled={!branding || reportMarkers.length === 0}
          variant="ghost"
          className="w-full justify-start gap-2 h-10 rounded-lg"
        >
          <FileDown className="h-4 w-4" />
          Gerar Laudo PDF
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
          <div className="flex items-center gap-3 min-w-0 flex-1">
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
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {role === "nutri" && (
              <Button
                onClick={handleNewChat}
                disabled={thinking}
                className="h-9 rounded-full bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] text-white hover:opacity-90 px-4 text-sm"
              >
                <Plus className="h-4 w-4 mr-1" />
                Nova Conversa
              </Button>
            )}
            <PatientChatHistory patientId={patientId} currentChatId={chatId} readOnly={readOnly} />
            <Button
              onClick={handleExportConversation}
              disabled={!branding || messages.length === 0}
              variant="ghost"
              size="sm"
              className="h-9 rounded-lg gap-1.5"
            >
              <Download className="h-4 w-4" />
              <span className="hidden lg:inline">Exportar</span>
            </Button>
            <Button
              onClick={handlePrint}
              disabled={!branding || reportMarkers.length === 0}
              variant="ghost"
              size="sm"
              className="h-9 rounded-lg gap-1.5"
            >
              <FileDown className="h-4 w-4" />
              <span className="hidden lg:inline">Laudo PDF</span>
            </Button>
            <Link
              to="/app/evolution/$patientId"
              params={{ patientId }}
              className="inline-flex items-center gap-1.5 h-9 rounded-lg px-3 text-sm hover:bg-muted/50 transition"
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
            {(!thinking && (showModuleSelector || (messages.length === 0 && role === "nutri"))) ? (
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
              <ChatMessageList 
                messages={messages} 
                thinking={thinking} 
                thinkingMode={thinkingMode} 
                highlightId={highlightId} 
                isStreaming={thinking}
                agentType={agentType}
              />
            )}
          </div>
        </main>

        <div className="shrink-0 px-3 sm:px-4 pb-4 sm:pb-6 pt-3">
          <div className="mx-auto w-full max-w-3xl">
            {readOnly ? (
              <div className="flex items-center justify-center gap-2 rounded-2xl border border-amber-200 bg-amber-50/80 backdrop-blur-sm px-4 py-3 text-xs text-amber-800 text-center">
                <Eye className="h-3.5 w-3.5 shrink-0" />
                Modo auditoria — você está visualizando esta conversa em modo somente leitura.
              </div>
            ) : (
              <>
                {(() => {
                  const meta = AGENT_BADGES[agentType] ?? AGENT_BADGES.exam;
                  return (
                    <div className="mb-2 flex justify-center">
                      <button
                        type="button"
                        onClick={() => setShowModuleSelector(true)}
                        className="inline-flex items-center gap-1.5 rounded-full bg-white/80 backdrop-blur-sm border border-[#e8a04c]/30 px-3 py-1 text-[11px] font-medium text-foreground shadow-sm hover:bg-white transition"
                        title="Trocar de módulo"
                      >
                        <span>{meta.icon}</span>
                        <span>{meta.label}</span>
                        <span className="text-muted-foreground/70 text-[10px]">• trocar</span>
                      </button>
                    </div>
                  );
                })()}
                {agentType !== "exam" && examContext && (
                  <div className="mb-2 text-center animate-in fade-in slide-in-from-bottom-1 duration-300">
                    <span className="text-[10px] text-muted-foreground inline-flex items-center justify-center gap-1 bg-white/40 backdrop-blur-sm px-2 py-0.5 rounded-full border border-muted/20">
                      <ClipboardList className="h-3 w-3 text-muted-foreground/70" />
                      Usando contexto do exame de {examContext.patient_name}
                    </span>
                  </div>
                )}
                <ChatInput onSubmit={wrappedSend} disabled={thinking || !chatId} uploadProgress={uploadProgress} />
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
    </div>
  );
}
