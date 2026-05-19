import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Download, Eye, FileDown, Menu, Plus, ShieldCheck, TrendingUp } from "lucide-react";
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
import { format, differenceInYears } from "date-fns";
import lummaSymbol from "@/assets/lumma-symbol.svg";

export const Route = createFileRoute("/app/chat/$patientId")({
  validateSearch: (s: Record<string, unknown>) => ({
    chatId: typeof s.chatId === "string" ? s.chatId : undefined,
    messageId: typeof s.messageId === "string" ? s.messageId : undefined,
  }),
  component: ChatPage,
});

interface PatientCtx {
  id: string;
  name: string;
  birth_date: string | null;
  gender: string | null;
  avatar_url: string | null;
}

function ChatPage() {
  const { patientId } = Route.useParams();
  const { chatId: forceChatId, messageId: highlightId } = Route.useSearch();
  const { role, profile } = useAuth();
  const readOnly = role === "admin" || role === "super_admin";
  const [patient, setPatient] = useState<PatientCtx | null>(null);
  const [exams, setExams] = useState<ExamItem[]>([]);
  const [reportMarkers, setReportMarkers] = useState<any[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [filters, setFilters] = useState<ExamFilters>(emptyFilters());
  const printRef = useRef<HTMLDivElement>(null);
  const conversationRef = useRef<HTMLDivElement>(null);
  const { data: branding } = useBrandingProfile(userId);
  const { messages, thinking, thinkingMode, sendMessage, chatId, error, uploadProgress, resetChat, setContext } = useDifyChat(patientId, {
    readOnly,
    forceChatId: forceChatId ?? null,
  });

  useEffect(() => {
    setContext({
      patient_sex: filters.sexo ? (filters.sexo === "masculino" ? "Masculino" : "Feminino") : "",
      patient_profile: filters.publico ? (filters.publico === "adulto" ? "Adulto" : "Gestante") : "",
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

  const SidebarContent = (
    <>
      <div className="px-5 py-4 border-b">
        <Link
          to="/app/patients"
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
            <div className="font-medium truncate">{patient?.name ?? "…"}</div>
            <div className="text-xs text-muted-foreground">
              {age !== null ? `${age} anos` : "—"}
              {patient?.gender && ` · ${patient.gender === "female" ? "Feminino" : patient.gender === "male" ? "Masculino" : "Outro"}`}
            </div>
          </div>
        </div>
      </div>
      <div className="px-3 py-2 border-b">
        <Link
          to="/app/evolution/$patientId"
          params={{ patientId }}
          className="flex items-center justify-between rounded-lg px-3 py-2 text-sm hover:bg-muted/50 transition min-h-11"
        >
          <span className="inline-flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-[#e8a04c]" />
            Evolução clínica
          </span>
          <span className="text-[10px] text-muted-foreground">gráficos</span>
        </Link>
      </div>
      <div className="px-3 py-3 border-b flex-1 min-h-0 flex flex-col">
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
    <div className="flex h-full max-h-full w-full overflow-hidden bg-gradient-to-br from-[#f3e8ff] via-[#e0f2fe] to-[#fce7f3]">
      {/* Left column: patient + exams (desktop) */}
      <aside className="hidden lg:flex h-full w-72 shrink-0 flex-col overflow-hidden border-r bg-white">
        {SidebarContent}
      </aside>

      {/* Main: chat */}
      <section className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
        <header className="sticky top-0 z-20 shrink-0 px-3 sm:px-6 py-3 sm:py-4 border-b border-white/40 bg-white/80 backdrop-blur-md flex items-center gap-2 sm:gap-4">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden shrink-0 h-10 w-10" aria-label="Abrir menu do paciente">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0 w-80 max-w-[85vw] flex flex-col bg-white">
              {SidebarContent}
            </SheetContent>
          </Sheet>
          <Avatar className="h-10 w-10 sm:h-12 sm:w-12 ring-2 ring-[#e89bcf]/30 lg:hidden shrink-0">
            {patient?.avatar_url && <AvatarImage src={patient.avatar_url} alt={patient.name} />}
            <AvatarFallback className="bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] text-white">
              {patient?.name?.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase() ?? "?"}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <h1
              className="text-lg sm:text-2xl bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] bg-clip-text text-transparent leading-tight truncate"
              style={{ fontFamily: "'Instrument Serif', serif" }}
            >
              Chat com Lumma
            </h1>
            <p className="text-[11px] sm:text-xs text-muted-foreground truncate">
              {patient?.name ? `Atendimento de ${patient.name}` : "Carregando paciente…"}
              <span className="hidden sm:inline">
                {chatId && ` · sessão iniciada em ${format(new Date(), "dd/MM/yyyy")}`}
              </span>
            </p>
            {error && (
              <p className="mt-1 text-[11px] sm:text-xs text-rose-600 line-clamp-2">{error}</p>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 shrink-0">
            {role === "nutri" && (
              <Button
                onClick={handleNewChat}
                disabled={thinking || !chatId}
                size="sm"
                className="rounded-full gap-2 bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] text-white hover:opacity-90 shadow-sm h-10 sm:h-9 px-3"
                title="Iniciar uma nova consulta para este paciente"
              >
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">Novo Chat</span>
              </Button>
            )}
            <Button
              onClick={handleExportConversation}
              disabled={!branding || messages.length === 0}
              size="sm"
              variant="outline"
              className="rounded-full gap-2 h-10 sm:h-9 px-3"
              title={messages.length === 0 ? "Nenhuma mensagem para exportar" : "Exportar conversa em PDF"}
            >
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">Exportar Conversa</span>
            </Button>
            <Button
              onClick={handlePrint}
              disabled={!branding || reportMarkers.length === 0}
              size="sm"
              variant="outline"
              className="rounded-full gap-2 h-10 sm:h-9 px-3"
              title={reportMarkers.length === 0 ? "Nenhum exame analisado para este paciente ainda" : "Gerar laudo profissional em PDF"}
            >
              <FileDown className="h-4 w-4" />
              <span className="hidden sm:inline">Gerar Laudo PDF</span>
            </Button>
          </div>
        </header>

        <div className="relative flex-1 min-h-0 overflow-hidden flex flex-col">
          {role === "nutri" && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden select-none z-0"
            >
              <span
                className="text-[clamp(1.25rem,8vw,5rem)] font-black uppercase tracking-widest text-black/[0.045] whitespace-nowrap"
                style={{ transform: "rotate(-25deg)" }}
              >
                AMBIENTE DE TESTES — VERSÃO 2.0 (MOTOR)
              </span>
            </div>
          )}
          <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden">
            {messages.length === 0 && !thinking && role === "nutri" ? (
              <div className="min-h-0 flex-1 overflow-y-auto">
                <ChatIntentPanel
                  filters={filters}
                  onChange={setFilters}
                  userName={profile?.full_name?.split(" ")[0]}
                />
              </div>
            ) : (
              <ChatMessageList messages={messages} thinking={thinking} thinkingMode={thinkingMode} highlightId={highlightId} />
            )}
          </div>
        </div>
        <div className="shrink-0 px-3 sm:px-4 pb-4 sm:pb-6 pt-3">
          <div className="mx-auto w-full max-w-3xl">
            {readOnly ? (
              <div className="flex items-center justify-center gap-2 rounded-2xl border border-amber-200 bg-amber-50/80 backdrop-blur-sm px-4 py-3 text-xs text-amber-800 text-center">
                <Eye className="h-3.5 w-3.5 shrink-0" />
                Modo auditoria — você está visualizando esta conversa em modo somente leitura.
              </div>
            ) : (
              <>
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
      </section>

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
  );
}
