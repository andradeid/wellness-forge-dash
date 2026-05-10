import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useEffect, useRef } from "react";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { ExamResultCard, type Marker } from "./ExamResultCard";
import { ChatThinking } from "./ChatThinking";
import { useAuth } from "@/hooks/useAuth";
import lummaSymbol from "@/assets/lumma-symbol.svg";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  structured_data?: {
    markers?: Marker[];
    indexed?: boolean;
    parse_error?: boolean;
  } | null;
  attachments?: Array<{ name: string }> | null;
}

export function ChatMessageList({
  messages,
  thinking,
}: {
  messages: ChatMessage[];
  thinking: boolean;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  const { role } = useAuth();
  const isAdmin = role === "super_admin" || role === "admin";
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking]);

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
      {messages.length === 0 && !thinking && (
        <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
          <img src={lummaSymbol} alt="" className="h-10 w-10 mb-3 opacity-70" />
          <p className="text-sm max-w-md">
            Envie uma mensagem ou arraste um exame em PDF/imagem para a Lumma analisar.
          </p>
        </div>
      )}

      {messages.map((m) => (
        <div
          key={m.id}
          className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
        >
          <div
            className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm ${
              m.role === "user"
                ? "bg-[#3d5a4a] text-white"
                : "bg-white border border-muted-foreground/10"
            }`}
          >
            {m.attachments && m.attachments.length > 0 && (
              <div className="mb-2 text-xs opacity-80">
                📎 {m.attachments.map((a) => a.name).join(", ")}
              </div>
            )}
            <div className="prose prose-sm max-w-none prose-p:my-1 prose-headings:my-2">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {m.content || (m.role === "assistant" ? "…" : "")}
              </ReactMarkdown>
            </div>
            {m.structured_data?.markers && m.structured_data.markers.length > 0 && (
              <div className="mt-3">
                <ExamResultCard markers={m.structured_data.markers} />
              </div>
            )}
            {m.role === "assistant" && isAdmin && m.structured_data?.indexed && (
              <div
                className="mt-2 inline-flex items-center gap-1 text-[10px] text-emerald-600/80"
                title="Marcadores indexados em patient_exam_results"
              >
                <CheckCircle2 className="h-3 w-3" /> indexado
              </div>
            )}
            {m.role === "assistant" && m.structured_data?.parse_error && (
              <div className="mt-2 inline-flex items-center gap-1 text-[11px] text-amber-600">
                <AlertTriangle className="h-3 w-3" /> Erro na estrutura de dados recebida
              </div>
            )}
          </div>
        </div>
      ))}

      {thinking && <ChatThinking />}
      <div ref={endRef} />
    </div>
  );
}
