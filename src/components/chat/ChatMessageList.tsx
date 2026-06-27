import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, AlertTriangle, FileText, Image as ImageIcon, Paperclip, ArrowDown, Copy, Printer, Edit2, Check, FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";
import { ExamResultCard, type Marker } from "./ExamResultCard";
import { ChatThinking } from "./ChatThinking";
import { MessageFeedback } from "./MessageFeedback";
import { useAuth } from "@/hooks/useAuth";
import { useBrandingProfile } from "@/hooks/useBrandingProfile";
import { Button } from "@/components/ui/button";
import { stripFormulacoesMarker, type FormulacoesPayload } from "@/lib/formulation-marker";
import { normalizePrescription } from "@/lib/normalize-prescription";
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
    formulacoes_sugeridas?: FormulacoesPayload;
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

/**
 * Find the end index (inclusive) of a balanced JSON object/array starting at `start`.
 * String-aware: ignora chaves dentro de strings JSON e respeita escapes.
 * Retorna -1 se incompleto (stream em andamento ou malformado).
 */
function findBalancedJsonEnd(text: string, start: number): number {
  const opener = text[start];
  if (opener !== "{" && opener !== "[") return -1;
  let brace = 0;
  let bracket = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escape) { escape = false; continue; }
      if (ch === "\\") { escape = true; continue; }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === "{") brace++;
    else if (ch === "}") brace--;
    else if (ch === "[") bracket++;
    else if (ch === "]") bracket--;
    if (brace === 0 && bracket === 0 && (ch === "}" || ch === "]") && i >= start) {
      return i;
    }
  }
  return -1;
}

/** Removes the markers JSON block (fenced or bare, complete or streaming) from displayed prose. */
function cleanProse(text: string): string {
  let out = stripFormulacoesMarker(text);

  // 1) Bloco com cerca ```json ... ``` contendo "markers": remove cerca + conteúdo.
  out = out.replace(/```json\s*([\s\S]*?)```/gi, (full, body: string) => {
    return /"markers"\s*:/.test(body) ? "" : full;
  });

  // 2) Cerca ```json aberta sem fechamento (streaming): corta dali em diante.
  const openFence = out.search(/```json\b/i);
  if (openFence !== -1 && !/```json[\s\S]*?```/i.test(out)) {
    out = out.slice(0, openFence);
  }

  // 3) Bloco JSON cru contendo "markers" (com ou sem fence parcial).
  //    Procura o '{' que precede a primeira ocorrência de "markers".
  const markersIdx = out.search(/"markers"\s*:/);
  if (markersIdx !== -1) {
    // O '{' que abre o objeto markers é o '{' imediatamente antes de "markers":.
    const objStart = out.lastIndexOf("{", markersIdx);
    if (objStart !== -1) {
      const end = findBalancedJsonEnd(out, objStart);
      if (end !== -1) {
        // JSON completo: remove o trecho inteiro e garante quebra dupla.
        out = out.slice(0, objStart).replace(/\s+$/, "") + "\n\n" + out.slice(end + 1).replace(/^\s+/, "");
      } else {
        // JSON ainda em streaming (não fechou): esconde o restante.
        out = out.slice(0, objStart);
      }
    }
  }

  return out
    .replace(/^\s*Parte\s*2\s*[—\-:].*$/gim, "")
    .replace(/^\s*JSON\s*(obrigat[óo]rio|marcadores)?\s*:?\s*$/gim, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}


/** Filters internal ReAct process (Thought/Action/Observation) for research agent. */
function cleanResearchOutput(text: string): string {
  if (!text) return "";
  
  // Regex to detect "Thought:", "Action:", "Action Input:", "Observation:"
  // and remove them along with their content.
  const lines = text.split("\n");
  
  const reactMarkers = [
    "Thought:", 
    "Action:", 
    "Action Input:", 
    "Observation:", 
    "Final Answer:",
    "Análise Final:",
    "Resumo da Pesquisa:"
  ];

  let lastMarkerIndex = -1;
  let isFinalAnswer = false;

  lines.forEach((line, i) => {
    const trimmed = line.trim();
    for (const marker of reactMarkers) {
      if (trimmed.startsWith(marker)) {
        lastMarkerIndex = i;
        if (marker === "Final Answer:" || marker === "Análise Final:" || marker === "Resumo da Pesquisa:") {
          isFinalAnswer = true;
        }
        break;
      }
    }
  });

  // If we found a final answer marker, we return only what follows it
  if (isFinalAnswer && lastMarkerIndex !== -1) {
    const finalContent = lines.slice(lastMarkerIndex + 1).join("\n").trim();
    
    // Search for content BEFORE the final answer marker that might be important (like observations)
    // but exclude technical Thoughts/Actions.
    const preContent = lines.slice(0, lastMarkerIndex)
      .filter(line => {
        const t = line.trim();
        return t && !t.startsWith("Thought:") && !t.startsWith("Action:") && !t.startsWith("Action Input:");
      })
      .join("\n")
      .trim();

    if (preContent) {
      return preContent + "\n\n" + finalContent;
    }
    return finalContent;
  }

  // If we are still in the ReAct process (found a marker but not a final one)
  if (lastMarkerIndex !== -1) {
    // Keep everything that isn't a technical marker line
    return lines.filter(line => {
      const t = line.trim();
      for (const m of ["Thought:", "Action:", "Action Input:"]) {
        if (t.startsWith(m)) return false;
      }
      return true;
    }).join("\n").trim();
  }

  return text.trim();
}

/** Fallback for research output when only internal thoughts are present. */
function researchFallback(text: string): string {
  if (!text) return "";
  const lines = text.split("\n");
  // If we have "Thought:" but nothing else significant, show the thoughts but slightly styled
  const thoughts = lines
    .filter(l => l.trim().startsWith("Thought:"))
    .map(l => l.replace("Thought:", "💭").trim())
    .join("\n\n");
  
  return thoughts || "O agente concluiu o processamento.";
}

/** Determines research status label based on internal ReAct blocks during streaming. */
function getResearchStatus(text: string): string | null {
  if (!text) return null;
  if (text.includes("fetch_pubmed_details")) return "📄 Analisando artigos encontrados...";
  if (text.includes("tavily")) return "🌐 Consultando fontes adicionais...";
  if (text.includes("Action:") || text.includes("Thought:")) return "🔍 Buscando artigos científicos...";
  return null;
}

function PrescriptionBlock({ title, body }: { title: string; body: string }) {
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const { user } = useAuth();
  const { data: profile } = useBrandingProfile(user?.id);

  const getCleanedBody = () => {
    if (!profile) return body;
    
    let cleaned = body;
    cleaned = cleaned.replace(/\[NOME COMPLETO DO NUTRICIONISTA\]/g, profile.full_name || "");
    cleaned = cleaned.replace(/\[Nº CRN\]|\[Seu CRN\]/g, profile.professional_id || "");
    cleaned = cleaned.replace(/\[Nome da Clínica\]|\[Endereço do Consultório\]/g, profile.clinic_name || "");
    cleaned = cleaned.replace(/\[Telefone\/Email\]/g, profile.phone || profile.email || "");
    cleaned = cleaned.replace(/\[Nome do Nutricionista\]/g, profile.full_name || "");
    return cleaned;
  };

  const cleanedBody = getCleanedBody();
  const [editableBody, setEditableBody] = useState(cleanedBody);

  useEffect(() => {
    setEditableBody(cleanedBody);
  }, [cleanedBody]);

  const fullText = `${title}\n\n${editableBody}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(fullText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error("Erro ao copiar receita:", e);
    }
  };

  const handlePrint = () => {
    const win = window.open("", "_blank", "width=800,height=900");
    if (!win) return;
    
    const logoHtml = profile?.clinic_logo_url 
      ? `<div style="text-align: center; margin-bottom: 20px;">
           <img src="${profile.clinic_logo_url}" style="max-height: 80px; width: auto;" />
         </div>`
      : "";

    const nutriInfoHtml = profile 
      ? `<div style="text-align: center; margin-bottom: 30px; font-size: 14px; color: #444;">
           <div style="font-weight: bold; font-size: 16px;">${profile.full_name}</div>
           <div>${profile.pronoun || "Nutricionista"} - CRN ${profile.professional_id || ""}</div>
           ${profile.clinic_name ? `<div>${profile.clinic_name}</div>` : ""}
         </div>`
      : "";

    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
<style>
  body { 
    font-family: Arial, Helvetica, sans-serif; 
    font-size: 14px; 
    color: #111; 
    padding: 40px; 
    line-height: 1.6;
  }
  h1 { 
    font-size: 18px; 
    border-bottom: 2px solid #e8a04c; 
    padding-bottom: 10px; 
    margin: 0 0 20px; 
    text-align: center;
    color: #333;
  }
  pre { 
    white-space: pre-wrap; 
    word-wrap: break-word; 
    font-family: inherit; 
    margin: 0; 
    text-align: justify;
  }
  @media print { 
    body { padding: 20px; } 
    button { display: none; }
  }
</style></head><body>
  ${logoHtml}
  ${nutriInfoHtml}
  <h1>${title}</h1>
  <pre>${editableBody.replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!))}</pre>
<script>window.onload = () => { window.focus(); window.print(); }<\/script>
</body></html>`);
    win.document.close();
  };

  return (
    <div className="bg-white border border-border rounded-lg p-6 font-mono text-xs shadow-sm mt-4">
      {profile && (
        <div className="text-center mb-4 border-b pb-4">
          {profile.clinic_logo_url && (
            <img 
              src={profile.clinic_logo_url} 
              className="max-h-16 mx-auto mb-3 object-contain" 
              alt={profile.clinic_name || "Logo"} 
            />
          )}
          <div className="text-muted-foreground space-y-0.5">
            <p className="font-semibold text-foreground text-sm">
              {profile.pronoun} {profile.full_name}
            </p>
            {profile.professional_id && <p>CRN {profile.professional_id}</p>}
            {profile.clinic_name && <p>{profile.clinic_name}</p>}
            {profile.phone && <p>{profile.phone}</p>}
          </div>
        </div>
      )}
      <div className="font-bold border-b mb-3 pb-2 text-foreground">{title}</div>
      <textarea
        value={editableBody}
        readOnly={!isEditing}
        onChange={(e) => setEditableBody(e.target.value)}
        className={`w-full bg-transparent font-mono text-xs resize-none border rounded p-2 outline-none whitespace-pre-wrap text-foreground transition-all ${
          isEditing 
            ? "border-amber-300 ring-1 ring-amber-200 bg-amber-50/30" 
            : "border-transparent hover:border-amber-100"
        }`}
        rows={Math.max(3, editableBody.split('\n').length)}
      />
      <div className="border-t mt-4 pt-3 flex flex-row flex-wrap gap-2 justify-end">
        <Button 
          variant={isEditing ? "default" : "outline"} 
          size="sm" 
          onClick={() => setIsEditing(!isEditing)}
          className={isEditing ? "bg-amber-500 hover:bg-amber-600 border-none" : ""}
        >
          {isEditing ? (
            <>
              <Check className="h-3.5 w-3.5 sm:mr-1.5" />
              <span className="hidden sm:inline">Concluir</span>
            </>
          ) : (
            <>
              <Edit2 className="h-3.5 w-3.5 sm:mr-1.5" />
              <span className="hidden sm:inline">Editar</span>
            </>
          )}
        </Button>
        <Button variant="outline" size="sm" onClick={handleCopy} disabled={isEditing}>
          <Copy className="h-3.5 w-3.5 sm:mr-1.5" />
          <span className="hidden sm:inline">{copied ? "✓ Copiado!" : "Copiar receita"}</span>
        </Button>
        <Button variant="outline" size="sm" onClick={handlePrint} disabled={isEditing}>
          <Printer className="h-3.5 w-3.5 sm:mr-1.5" />
          <span className="hidden sm:inline">Imprimir</span>
        </Button>
      </div>
    </div>
  );
}

export function ChatMessageList({
  messages,
  thinking,
  thinkingMode = "analysis",
  highlightId,
  isStreaming,
  agentType,
  onGenerateRecipe,
}: {
  messages: ChatMessage[];
  thinking: boolean;
  thinkingMode?: "analysis" | "simple";
  highlightId?: string;
  isStreaming?: boolean;
  agentType?: string;
  onGenerateRecipe?: (payload: FormulacoesPayload, messageId: string) => void;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);
  const lastUserMessageRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const hasInitialScrolled = useRef(false);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const { role } = useAuth();
  const isAdmin = role === "super_admin" || role === "admin";
  const lastUserIndex = messages.reduce((acc, msg, idx) => (msg.role === "user" ? idx : acc), -1);

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
    if (lastUserIndex !== -1) {
      lastUserMessageRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    }
  }, [lastUserIndex]);

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

          {messages.map((m, i) => {
            const isUser = m.role === "user";
            const isLastUserMessage = isUser && i === lastUserIndex;
            
            const parts = isUser ? [{ type: "text" as const, value: m.content }] : splitJsonBlocks(m.content);
            const isHighlighted = highlightId === m.id;
            const hasPrescriptionMsg = !isUser && m.content.includes("MODELO DE RECEITUÁRIO PARA FARMÁCIA");

            return (
              <div
                key={m.id}
                ref={isHighlighted ? highlightRef : (isLastUserMessage ? lastUserMessageRef : undefined)}
                className={`flex ${isUser ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`${hasPrescriptionMsg ? "w-full max-w-full" : "max-w-[85%]"} rounded-2xl px-4 py-3 text-sm shadow-sm backdrop-blur-md transition-all ${
                    isUser
                      ? "bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] text-white border border-white/10"
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
                  {m.role === "assistant" && m.structured_data?.formulacoes_sugeridas && onGenerateRecipe && (
                    <div className="mb-4 p-4 rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50 to-white shadow-sm">
                      <div className="flex items-start gap-3">
                        <div className="shrink-0 h-9 w-9 rounded-lg bg-violet-100 flex items-center justify-center">
                          <FlaskConical className="h-5 w-5 text-violet-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-violet-900">
                            {m.structured_data.formulacoes_sugeridas.formulacoes.length} formulação(ões) sugerida(s)
                          </div>
                          <div className="text-xs text-violet-700/80 mt-0.5">
                            Envie ao agente de formulações para gerar a receita pronta para a farmácia.
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              className="bg-violet-600 hover:bg-violet-700 text-white"
                              onClick={() => onGenerateRecipe(m.structured_data!.formulacoes_sugeridas!, m.id)}
                            >
                              <FlaskConical className="h-3.5 w-3.5 mr-1.5" />
                              Gerar receita
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  {parts
                    .filter((p) => p.type === "text")
                    .map((p, i) => {
                      const isResearch = m.agent_type === "research" || agentType === "research";
                      
                      // Handling streaming status for research agent
                      if (isResearch && m.role === "assistant" && i === parts.length - 1) {
                        // DURANTE o streaming, aplicamos os filtros e mostramos o status
                        if (isStreaming) {
                          const status = getResearchStatus(p.value);
                          const cleaned = cleanResearchOutput(p.value);
                          
                          // Se temos um status (ainda nos loops ReAct) e NENHUM conteúdo final ainda
                          if (status && !cleaned) {
                            return (
                              <div key={i} className="text-muted-foreground italic text-xs py-1 animate-pulse">
                                {status}
                              </div>
                            );
                          }
                        }
                      }

                      // AJUSTE 2: Se NÃO está em streaming e é agente research, renderiza o conteúdo original
                      // (evitando que o filtro oculte o final da mensagem se ela for cortada pelo Dify)
                      const cleaned = isUser 
                        ? p.value 
                        : (isResearch && !isStreaming ? p.value : (isResearch ? cleanResearchOutput(p.value) : cleanProse(p.value)));

                      // If cleaned output is empty but we have content and it's research, use fallback
                      const finalContent = (!cleaned && m.role === "assistant" && p.value && isResearch) 
                        ? researchFallback(p.value) 
                        : cleaned;

                      const prescriptionTrigger = "MODELO DE RECEITUÁRIO PARA FARMÁCIA";
                      const hasPrescription = finalContent?.includes(prescriptionTrigger);

                      if (hasPrescription) {
                        const parts = finalContent.split(prescriptionTrigger);
                        const before = parts[0];
                        const prescriptionContent = prescriptionTrigger + parts.slice(1).join(prescriptionTrigger);

                        return (
                          <div key={i} className="space-y-4">
                            {before && (
                              <div className={cn(
                                "prose prose-sm max-w-none",
                                "prose-p:my-2",
                                "prose-strong:text-foreground prose-strong:font-semibold",
                                "prose-ul:my-2 prose-ul:space-y-1",
                                "prose-ol:my-2 prose-ol:space-y-1",
                                "prose-li:my-0",
                                "[&_h1]:text-base [&_h1]:font-bold [&_h1]:mt-5 [&_h1]:mb-2 [&_h1]:text-foreground", "[&_h2]:text-sm [&_h2]:font-bold [&_h2]:mt-5 [&_h2]:mb-2 [&_h2]:border-b [&_h2]:border-border [&_h2]:pb-1 [&_h2]:text-foreground",
                                "[&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-4 [&_h3]:mb-1 [&_h3]:text-foreground",
                                "[&_hr]:my-4 [&_hr]:border-border"
                              )}>
                                <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
                                  {normalizePrescription(before)}
                                </ReactMarkdown>
                              </div>
                            )}
                            <PrescriptionBlock
                              title={`${prescriptionTrigger} DE MANIPULAÇÃO`}
                              body={prescriptionContent.replace(prescriptionTrigger + " DE MANIPULAÇÃO", "").trim()}
                            />

                          </div>
                        );
                      }

                      return (
                        <div
                          key={i}
                          className={cn(
                            "prose prose-sm max-w-none",
                            "prose-p:my-2",
                            "prose-strong:text-foreground prose-strong:font-semibold",
                            "prose-ul:my-2 prose-ul:space-y-1",
                            "prose-ol:my-2 prose-ol:space-y-1",
                            "prose-li:my-0",
                            "[&_h1]:text-base [&_h1]:font-bold [&_h1]:mt-5 [&_h1]:mb-2 [&_h1]:text-foreground", "[&_h2]:text-sm [&_h2]:font-bold [&_h2]:mt-5 [&_h2]:mb-2 [&_h2]:border-b [&_h2]:border-border [&_h2]:pb-1 [&_h2]:text-foreground",
                            "[&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-4 [&_h3]:mb-1 [&_h3]:text-foreground",
                            "[&_hr]:my-4 [&_hr]:border-border",
                            isResearch && [
                              "[&_table]:overflow-x-auto",
                              "[&_table]:block",
                              "[&_pre]:bg-muted [&_pre]:p-2",
                              "[&_pre]:rounded [&_pre]:text-xs",
                              "[&_pre]:overflow-x-auto"
                            ]
                          )}
                        >
                          <ReactMarkdown 
                            remarkPlugins={[remarkGfm, remarkBreaks]}
                            components={isResearch ? {
                              a: ({ href, children }) => (
                                <a
                                  href={href}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-primary underline hover:opacity-80"
                                >
                                  {children}
                                </a>
                              )
                            } : undefined}
                          >
                            {normalizePrescription(finalContent || "")}
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
                    className={`mt-2 flex items-center gap-1.5 sm:gap-2 text-[9px] sm:text-[10px] ${
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
                <ChatThinking mode={thinkingMode} agentType={agentType} />
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
