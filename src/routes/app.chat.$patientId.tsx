import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useDifyChat } from "@/hooks/useDifyChat";
import { ChatMessageList } from "@/components/chat/ChatMessageList";
import { ChatInput } from "@/components/chat/ChatInput";
import { ExamHistoryList, type ExamItem } from "@/components/chat/ExamHistoryList";
import { format, differenceInYears } from "date-fns";

export const Route = createFileRoute("/app/chat/$patientId")({
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
}

function ChatPage() {
  const { patientId } = Route.useParams();
  const [patient, setPatient] = useState<PatientCtx | null>(null);
  const [exams, setExams] = useState<ExamItem[]>([]);
  const { messages, thinking, sendMessage, chatId, error } = useDifyChat(patientId);

  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any)
        .from("patients")
        .select("id, name, birth_date, gender")
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

  return (
    <div className="flex h-screen w-full bg-[#f5f5f0] overflow-hidden">
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
            <div className="h-10 w-10 rounded-full bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] flex items-center justify-center text-white">
              <User className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="font-medium truncate">{patient?.name ?? "…"}</div>
              <div className="text-xs text-muted-foreground">
                {age !== null ? `${age} anos` : "—"}
                {patient?.gender && ` · ${patient.gender === "female" ? "Feminino" : patient.gender === "male" ? "Masculino" : "Outro"}`}
              </div>
            </div>
          </div>
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
        <header className="px-6 py-4 border-b bg-white shrink-0">
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
        </header>

        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
          <ChatMessageList messages={messages} thinking={thinking} />
        </div>
        <div className="shrink-0 px-3 pb-3 pt-2 bg-[#f5f5f0]">
          <div className="rounded-2xl bg-white shadow-md border border-muted-foreground/10 overflow-hidden">
            <ChatInput onSubmit={sendMessage} disabled={thinking || !chatId} />
          </div>
        </div>
      </section>
    </div>
  );
}
