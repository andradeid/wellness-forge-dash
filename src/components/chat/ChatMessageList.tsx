import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, AlertTriangle, FileText, Image as ImageIcon, Paperclip, ArrowDown } from "lucide-react";
import { ExamResultCard, type Marker } from "./ExamResultCard";
import { ChatThinking } from "./ChatThinking";
import { MessageFeedback } from "./MessageFeedback";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import lummaSymbol from "@/assets/lumma-symbol.svg";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  agent_type?: string;
  structured_data?: {
    markers?: Marker[];
    indexed?: boolean;
    parse_error?: boolean;
    processing_ms?: number;
    not_a_lab_report_error?: string;
  } | null;
  attachments?: Array<{ name: string }> | null;
  created_at?: string | null;
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

/** Removes JSON preamble headings and any unterminated streaming JSON tail. */
function cleanProse(text: string): string {
  let out = text;
  // Strip unterminated ```json ... (still streaming, no closing fence yet)
  const fenceOpen = out.search(/```json\b/i);
  if (fenceOpen !== -1 && !/```json[\s\S]*?```/i.test(out)) {
    out = out.slice(0, fenceOpen);
  }
  // Strip unterminated loose "json { ..." block while streaming
  const looseOpen = out.search(/(?:^|\n)\s*json\s*\{/i);
  if (looseOpen !== -1 && !/(?:^|\n)\s*json\s*\{[\s\S]*?\}(?=\n|$)/i.test(out)) {
    out = out.slice(0, looseOpen);
  }
  // Also hide bare streaming JSON object that starts the tail (no "json" keyword)
  const braceOpen = out.search(/(?:^|\n)\s*\{\s*"\w/);
  if (braceOpen !== -1) {
    const tail = out.slice(braceOpen);
    // unbalanced braces => still streaming => hide it
    const opens = (tail.match(/\{/g) || []).length;
    const closes = (tail.match(/\}/g) || []).length;
    if (opens !== closes) out = out.slice(0, braceOpen);
  }
  return out
    .replace(/^\s*Parte\s*2\s*[—\-:].*$/gim, "")
    .replace(/^\s*JSON\s*(obrigat[óo]rio|marcadores)?\s*:?\s*$/gim, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}


export function ChatMessageList({
  messages,
  thinking,
  thinkingMode = "analysis",
  highlightId,
  isStreaming,
  agentType,
}: {
  messages: ChatMessage[];
  thinking: boolean;
  thinkingMode?: "analysis" | "simple";
  highlightId?: string;
  isStreaming?: boolean;
  agentType?: string;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);
  const lastUserMessageRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const hasInitialScrolled = useRef(false);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const { role } = useAuth();
  const isAdmin = role === "super_admin" || role === "admin";

  const scrollToBottom = (smooth = true) => {
    bottomRef.current?.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "end" });
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    userScrolledUp.current = !isAtBottom;
    setShowScrollButton(!isAtBottom);
  };

  // Scroll inicial ao abrir a conversa (primeira carga de mensagens)
  useEffect(() => {
    if (messages.length > 0 && !hasInitialScrolled.current) {
      // Pequeno timeout para garantir que o layout renderizou
      const timer = setTimeout(() => {
        scrollToBottom(false);
        hasInitialScrolled.current = true;
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [messages]);

  // Highlight de mensagem específica (busca / navegação) mantém scroll automático
  useEffect(() => {
    if (highlightId && highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlightId]);

  const userScrolledUp = useRef(false);

  // Rola para a última mensagem do usuário (âncora no topo)
  useEffect(() => {
    const lastUserMsg = messages
      .filter(m => m.role === 'user')
      .at(-1);
    
    if (lastUserMsg) {
      lastUserMessageRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    }
  }, [messages.filter(m => m.role === 'user').length]);

  // Highlight de mensagem específica (busca / navegação)
  useEffect(() => {
    if (highlightId && highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlightId]);


  return (
    <div className="flex-1 relative overflow-hidden flex flex-col">
      <div 
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto px-4 py-6" 
        onScroll={handleScroll}
      >
        <div className="mx-auto w-full max-w-3xl space-y-5">
          {messages.length === 0 && !thinking && (
            <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground">
              <img src={lummaSymbol} alt="" className="h-10 w-10 mb-3 opacity-70" />
              <p className="text-sm max-w-md">
                {agentType === 'research' 
                  ? "Explore evidências científicas, analise artigos e aprofunde seus conhecimentos acadêmicos com a Lumma."
                  : "Envie uma mensagem ou arraste um exame em PDF/imagem para a Lumma analisar."}
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
                    <div className="mb-2 flex flex-col gap-1 text-xs opacity-90">
                      {m.attachments.map((a, idx) => {
                        const name = a.name || "";
                        const ext = name.split(".").pop()?.toLowerCase() ?? "";
                        const isPdf = ext === "pdf";
                        const isImage = ["png", "jpg", "jpeg", "webp", "gif", "bmp", "svg", "heic"].includes(ext);
                        const Icon = isPdf ? FileText : isImage ? ImageIcon : Paperclip;
                        return (
                          <div key={idx} className="inline-flex items-center gap-1.5">
                            <Icon className={`h-3.5 w-3.5 ${isPdf ? "text-rose-300" : isImage ? "text-sky-300" : ""}`} />
                            <span className="truncate">{name}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {m.structured_data?.not_a_lab_report_error && (
                    <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-3 text-amber-900 shadow-sm animate-in fade-in slide-in-from-top-2 duration-300">
                      <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                      <div className="text-sm font-medium leading-relaxed">
                        {m.structured_data.not_a_lab_report_error}
                      </div>
                    </div>
                  )}
                  {m.structured_data?.markers && 
                   m.structured_data.markers.length > 0 && 
                   (m.agent_type?.startsWith('exam') || (!m.agent_type && agentType?.startsWith('exam'))) && (
                    <div className="mb-4">
                      <ExamResultCard markers={m.structured_data.markers} />
                    </div>
                  )}
                  {parts
                    .filter((p) => p.type === "text")
                    .map((p, i) => {
                      const cleaned = isUser ? p.value : cleanProse(p.value);
                      if (!cleaned && m.role === "assistant") return null;
                      return (
                        <div
                          key={i}
                          className="prose prose-sm max-w-none prose-p:my-1 prose-headings:my-2"
                        >
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {cleaned || ""}
                          </ReactMarkdown>
                        </div>
                      );
                    })}
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
                  <div
                    className={`mt-2 flex items-center gap-2 text-[10px] ${
                      isUser ? "text-white/70 justify-end" : "text-muted-foreground/70 justify-start"
                    }`}
                  >
                    {m.created_at && (
                      <span title={new Date(m.created_at).toLocaleString("pt-BR")}>
                        {new Date(m.created_at).toLocaleString("pt-BR", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    )}
                    {m.role === "assistant" && typeof m.structured_data?.processing_ms === "number" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-1.5 py-0.5 text-amber-700">
                        ⏱ {(m.structured_data.processing_ms / 1000).toFixed(2)}s
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {thinking && (
            <div className="flex justify-start">
              <div className="rounded-2xl bg-white/60 backdrop-blur-md border border-white/60 shadow-sm px-2">
                <ChatThinking mode={thinkingMode} />
              </div>
            </div>
          )}
          <div ref={bottomRef} className="h-px w-full" />
        </div>
      </div>

      {showScrollButton && (
        <div className="absolute bottom-6 left-0 right-0 flex justify-center pointer-events-none z-20">
          <Button
            variant="secondary"
            size="icon"
            onClick={() => scrollToBottom()}
            className="rounded-full shadow-xl border border-[#3d5a4a]/20 bg-white/90 backdrop-blur-md pointer-events-auto hover:bg-[#3d5a4a] hover:text-white transition-all duration-300 animate-in fade-in zoom-in slide-in-from-bottom-4"
            title="Ir para as mensagens recentes"
          >
            <ArrowDown className="h-5 w-5" />
          </Button>
        </div>
      )}
    </div>
  );
}
