import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useEffect, useRef } from "react";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { ExamResultCard, type Marker } from "./ExamResultCard";
import { ChatThinking } from "./ChatThinking";
import { MessageFeedback } from "./MessageFeedback";
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

/** Splits assistant text into prose + JSON code blocks for elegant rendering. */
function splitJsonBlocks(text: string): Array<{ type: "text" | "json"; value: string }> {
  if (!text) return [];
  const parts: Array<{ type: "text" | "json"; value: string }> = [];
  // Match ```json ... ``` fenced blocks OR loose `json { ... }` segments
  const regex = /```json\s*([\s\S]*?)```|(?:^|\n)\s*json\s*(\{[\s\S]*?\})(?=\n|$)/gi;
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > lastIndex) {
      parts.push({ type: "text", value: text.slice(lastIndex, m.index) });
    }
    const raw = (m[1] ?? m[2] ?? "").trim();
    let pretty = raw;
    try {
      pretty = JSON.stringify(JSON.parse(raw), null, 2);
    } catch {
      /* keep raw */
    }
    parts.push({ type: "json", value: pretty });
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    parts.push({ type: "text", value: text.slice(lastIndex) });
  }
  return parts.length > 0 ? parts : [{ type: "text", value: text }];
}

function JsonCodeBlock({ value }: { value: string }) {
  return (
    <div className="my-2 rounded-xl border border-slate-700/50 bg-slate-900/95 shadow-md overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-700/50 bg-slate-800/60">
        <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
          json · marcadores
        </span>
        <span className="h-2 w-2 rounded-full bg-emerald-400/80" />
      </div>
      <pre className="px-3 py-2 text-[11.5px] leading-relaxed text-slate-100 overflow-x-auto font-mono">
        {value}
      </pre>
    </div>
  );
}

export function ChatMessageList({
  messages,
  thinking,
  highlightId,
}: {
  messages: ChatMessage[];
  thinking: boolean;
  highlightId?: string;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);
  const { role } = useAuth();
  const isAdmin = role === "super_admin" || role === "admin";
  useEffect(() => {
    if (highlightId && highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking, highlightId]);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6">
      <div className="mx-auto w-full max-w-3xl space-y-5">
        {messages.length === 0 && !thinking && (
          <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground">
            <img src={lummaSymbol} alt="" className="h-10 w-10 mb-3 opacity-70" />
            <p className="text-sm max-w-md">
              Envie uma mensagem ou arraste um exame em PDF/imagem para a Lumma analisar.
            </p>
          </div>
        )}

        {messages.map((m) => {
          const isUser = m.role === "user";
          const parts = isUser ? [{ type: "text" as const, value: m.content }] : splitJsonBlocks(m.content);
          const isHighlighted = highlightId === m.id;
          return (
            <div
              key={m.id}
              ref={isHighlighted ? highlightRef : undefined}
              className={`flex ${isUser ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm backdrop-blur-md transition-all ${
                  isUser
                    ? "bg-gradient-to-br from-[#3d5a4a]/95 to-[#2f4a3c]/95 text-white border border-white/10"
                    : "bg-white/70 border border-white/60 text-foreground"
                } ${isHighlighted ? "ring-2 ring-amber-400 ring-offset-2 ring-offset-transparent shadow-lg" : ""}`}
              >
                {m.attachments && m.attachments.length > 0 && (
                  <div className="mb-2 text-xs opacity-80">
                    📎 {m.attachments.map((a) => a.name).join(", ")}
                  </div>
                )}
                {parts.map((p, i) =>
                  p.type === "json" ? (
                    <JsonCodeBlock key={i} value={p.value} />
                  ) : (
                    <div
                      key={i}
                      className="prose prose-sm max-w-none prose-p:my-1 prose-headings:my-2"
                    >
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {p.value || (m.role === "assistant" ? "…" : "")}
                      </ReactMarkdown>
                    </div>
                  ),
                )}
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
                {m.role === "assistant" && <MessageFeedback messageId={m.id} />}
              </div>
            </div>
          );
        })}

        {thinking && (
          <div className="flex justify-start">
            <div className="rounded-2xl bg-white/60 backdrop-blur-md border border-white/60 shadow-sm px-2">
              <ChatThinking />
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
}
