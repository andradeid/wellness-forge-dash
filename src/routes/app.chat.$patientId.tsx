import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Eye, FileDown, TrendingUp } from "lucide-react";
import { useReactToPrint } from "react-to-print";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useDifyChat } from "@/hooks/useDifyChat";
import { ChatMessageList } from "@/components/chat/ChatMessageList";
import { ChatInput } from "@/components/chat/ChatInput";
import { ExamHistoryList, type ExamItem } from "@/components/chat/ExamHistoryList";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useBrandingProfile } from "@/hooks/useBrandingProfile";
import { PatientReportPDF } from "@/components/branding/PatientReportPDF";
import { format, differenceInYears } from "date-fns";
import lummaSymbol from "@/assets/lumma-symbol.svg";

export const Route = createFileRoute("/app/chat/$patientId")({
  validateSearch: (s: Record<string, unknown>) => ({
    chatId: typeof s.chatId === "string" ? s.chatId : undefined,
    messageId: typeof s.messageId === "string" ? s.messageId : undefined,
  }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/login" });
  },
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
  const { role } = useAuth();
  const readOnly = role === "admin" || role === "super_admin";
  const [patient, setPatient] = useState<PatientCtx | null>(null);
  const [exams, setExams] = useState<ExamItem[]>([]);
  const [reportMarkers, setReportMarkers] = useState<any[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const printRef = useRef<HTMLDivElement>(null);
  const { data: branding } = useBrandingProfile(userId);
  const { messages, thinking, sendMessage, chatId, error } = useDifyChat(patientId, {
    readOnly,
    forceChatId: forceChatId ?? null,
  });

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

  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any)
        .from("patient_exams")
        .select("id, file_name, mime_type, created_at")
        .eq("patient_id", patientId)
        .order("created_at", { ascending: false })
        .limit(20);
      setExams((data as ExamItem[]) ?? []);
    })();
  }, [patientId, messages.length]);

  const age = patient?.birth_date
    ? differenceInYears(new Date(), new Date(patient.birth_date))
    : null;

  const initialLoading = patient === null || chatId === null;

  if (initialLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#f5f5f0] overflow-hidden">
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

  return (
    <div className="flex h-screen w-full overflow-hidden bg-gradient-to-br from-[#f3e8ff] via-[#e0f2fe] to-[#fce7f3]">
      {/* Left column: patient + exams */}
      <aside className="hidden lg:flex w-72 flex-col border-r bg-white shrink-0">
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
            className="flex items-center justify-between rounded-lg px-3 py-2 text-sm hover:bg-muted/50 transition"
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
            <ExamHistoryList exams={exams} />
          </div>
        </div>
      </aside>

      {/* Main: chat */}
      <section className="flex-1 flex flex-col min-w-0 h-full">
        <header className="px-6 py-4 border-b border-white/40 bg-white/60 backdrop-blur-md shrink-0 flex items-center gap-4">
          <Avatar className="h-12 w-12 ring-2 ring-[#e89bcf]/30 lg:hidden">
            {patient?.avatar_url && <AvatarImage src={patient.avatar_url} alt={patient.name} />}
            <AvatarFallback className="bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] text-white">
              {patient?.name?.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase() ?? "?"}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <h1
              className="text-2xl bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] bg-clip-text text-transparent"
              style={{ fontFamily: "'Instrument Serif', serif" }}
            >
              Chat com Lumma
            </h1>
            <p className="text-xs text-muted-foreground">
              {patient?.name ? `Atendimento de ${patient.name}` : "Carregando paciente…"}
              {chatId && ` · sessão iniciada em ${format(new Date(), "dd/MM/yyyy")}`}
            </p>
            {error && (
              <p className="mt-2 text-xs text-rose-600">{error}</p>
            )}
          </div>
        </header>

        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
          <ChatMessageList messages={messages} thinking={thinking} highlightId={highlightId} />
        </div>
        <div className="shrink-0 px-4 pb-6 pt-3">
          <div className="mx-auto w-full max-w-3xl">
            {readOnly ? (
              <div className="flex items-center justify-center gap-2 rounded-2xl border border-amber-200 bg-amber-50/80 backdrop-blur-sm px-4 py-3 text-xs text-amber-800">
                <Eye className="h-3.5 w-3.5" />
                Modo auditoria — você está visualizando esta conversa em modo somente leitura.
              </div>
            ) : (
              <>
                <ChatInput onSubmit={sendMessage} disabled={thinking || !chatId} />
                <p className="mt-2 text-center text-[11px] text-muted-foreground">
                  Máximo de 10 arquivos de 20MB
                </p>
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
