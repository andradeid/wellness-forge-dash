import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { ChatMessage } from "@/components/chat/ChatMessageList";
import type { AttachmentProgressItem, AttachmentProgressStage } from "@/components/chat/ChatInput";
import type { Marker } from "@/components/chat/ExamResultCard";
import {
  processAndPersistMarkers,
  logStructuredAudit,
  classificationVisualState,
  type RawMarker,
} from "@/lib/exam-markers";
import { useCreditsActions, useMyCredits } from "@/hooks/useCredits";
import { paywallStore } from "@/lib/paywall-store";
import { resolveAgentKey } from "@/lib/agent-key-map";
import { sanitizeFilename } from "@/lib/sanitize-filename";
import { enforceSessionGuard } from "@/lib/session-guard";
import { extractFormulacoes } from "@/lib/formulation-marker";
import { stripAgentScaffolding } from "@/lib/agent-scaffolding";
import { buildAgentContextPrefix } from "@/lib/agent-context-builders";

export interface ExamContext {
  patient_name: string;
  patient_profile: string;
  patient_sex: string;
  patient_age: string;
  gestante_tipo: string;
  gestante_periodo: string;
  exam_date: string;
  alteracoes: string[];
  otimos: string[];
  resumo_clinico: string;
  resumo_texto?: string; // fallback: análise textual completa quando não há marcadores estruturados
  agent_type?: string;
}

type ExamContextMeta = Pick<
  ExamContext,
  "patient_name" | "patient_profile" | "patient_sex" | "patient_age" | "gestante_tipo" | "gestante_periodo"
>;

function buildExamContextFromAnalysis({
  text,
  markers,
  meta,
  agentType,
  previous,
}: {
  text: string;
  markers: Marker[];
  meta: Partial<ExamContextMeta>;
  agentType?: string | null;
  previous?: ExamContext | null;
}): ExamContext {
  const safeMarkers = markers ?? [];
  return {
    patient_name: meta.patient_name || previous?.patient_name || "Paciente",
    patient_profile: meta.patient_profile || previous?.patient_profile || "",
    patient_sex: meta.patient_sex || previous?.patient_sex || "",
    patient_age: meta.patient_age || previous?.patient_age || "",
    gestante_tipo: meta.gestante_tipo || previous?.gestante_tipo || "",
    gestante_periodo: meta.gestante_periodo || previous?.gestante_periodo || "",
    exam_date: new Date().toISOString(),
    alteracoes: safeMarkers
      .filter((m: Marker) => {
        const visual = classificationVisualState(m.classification);
        return visual !== "otimo" && visual !== "normal" && visual !== "desconhecido";
      })
      .map((m: Marker) => `${m.name}: ${m.value} ${m.unit || ""} (${m.classification})`),
    otimos: safeMarkers
      .filter((m: Marker) => classificationVisualState(m.classification) === "otimo")
      .map((m: Marker) => `${m.name}: ${m.value} ${m.unit || ""}`),
    resumo_clinico: safeMarkers
      .map((m: Marker) => `${m.name} ${m.value} ${m.unit || ""} — ${m.classification}`)
      .join(" | "),
    resumo_texto: text.slice(0, 4000),
    agent_type: agentType || previous?.agent_type,
  };
}

function hasExamMarkersMessage(message: ChatMessage): message is ChatMessage & {
  structured_data: NonNullable<ChatMessage["structured_data"]> & { markers: Marker[] };
} {
  return (
    message.role === "assistant" &&
    message.agent_type?.startsWith("exam") === true &&
    Array.isArray(message.structured_data?.markers) &&
    message.structured_data.markers.length > 0
  );
}

interface DifyFileRef {
  type: "image" | "document";
  transfer_method: "local_file" | "remote_url";
  upload_file_id?: string;
  url?: string;
}

function inferClassification(s: string): string {
  const t = s.toLowerCase();
  if (/(crític|alerta)/.test(t)) return "atencao";
  if (/(elevad|^alto|\balto\b|\balta\b|acima)/.test(t)) return "alto";
  if (/(baix|deficien|abaixo|insuficien)/.test(t)) return "baixo";
  if (/(atenç|limítrof|limitrof|borderline)/.test(t)) return "atencao";
  if (/(ótim|otim|normal|adequad|dentro|controlad|saudáv|saudav)/.test(t)) return "normal";
  return "";
}

function extractMarkersFromText(text: string): Marker[] {
  const out: Marker[] = [];
  // Match bullet lines like:
  //   - Glicose: 82 mg/dL (normal — ref 75-85)
  //   - Vitamina D (25-OH): 60 ng/mL — adequado
  //   * HDL Colesterol — 54 mg/dL: dentro do esperado
  const lineRe = /^[\s>]*[-*•]\s*([A-Za-zÀ-ÿ0-9()/\s.+-]{2,60}?)\s*[:\-—–(]\s*([<≤>≥]?\s*-?\d+(?:[.,]\d+)?)\s*([%A-Za-zµμ/]+)?\b([^\n]*)/gm;
  let m: RegExpExecArray | null;
  const seen = new Set<string>();
  while ((m = lineRe.exec(text))) {
    const rawName = m[1].replace(/\s+/g, " ").trim().replace(/[(]$/, "").trim();
    if (!rawName || /^(paciente|nome|data|gênero|genero|análise|analise|conclus|recomendaç|observaç)/i.test(rawName)) continue;
    const value = m[2].replace(/\s+/g, "");
    const unit = (m[3] || "").trim();
    const tail = (m[4] || "").trim();
    const refMatch = tail.match(/(\d+(?:[.,]\d+)?\s*[-–]\s*\d+(?:[.,]\d+)?|[<≤>≥]\s*\d+(?:[.,]\d+)?)/);
    const reference = refMatch ? refMatch[1] : "";
    const classification = inferClassification(tail) || inferClassification(rawName);
    const key = rawName.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      name: rawName,
      value,
      unit: unit || undefined,
      reference: reference || undefined,
      classification: (classification || "normal") as Marker["classification"],
    });
  }
  return out;
}

/**
 * Detecta se a mensagem do usuário já traz um LAUDO/EXAME completo
 * (via arquivo anexado OU texto colado). Quando true, o chamador
 * SUPRIME o prefixo de contexto automático — o conteúdo principal já
 * veio na própria mensagem e o prefixo antigo apenas contamina o prompt.
 *
 * Regra central: palavra-chave só conta quando aparece grudada a um
 * valor+unidade (janela de ~40 chars). Isso separa "colei um laudo"
 * de "estou falando sobre um exame já analisado".
 */
const _UNIT = String.raw`(mg\/dL|ng\/mL|pg\/mL|µg\/dL|mcg\/dL|UI\/L|U\/L|mIU\/L|mmol\/L|mEq\/L|g\/dL|%|10\^?\d+\/[µu]?L)`;
const _NUM = String.raw`\d+[.,]?\d*`;
const _LAB_KW = String.raw`hemograma|glicose|colesterol|hdl|ldl|triglic\w*|tsh|t3|t4|creatinina|ureia|hemoglobin\w*|leuc[oó]cit\w*|plaquet\w*|ferritin\w*|vitamina\s*d|b12|pcr|insulin\w*`;
const _GENETIC_KW = String.raw`snp|rs\d{3,}|gen[oó]tipo|polimorfismo|alelo|homozigot\w*|heterozigot\w*|mthfr|comt|apoe|vdr`;
const _MICROBIOME_KW = String.raw`microbiot\w*|microbiom\w*|firmicutes|bacteroidet\w*|akkermansia|disbios\w*|f\/b\s*ratio`;

const _near = (kw: string) =>
  new RegExp(
    `(?:(?:${kw})[^\\n]{0,40}?${_NUM}\\s*${_UNIT})|(?:${_NUM}\\s*${_UNIT}[^\\n]{0,40}?(?:${kw}))`,
    "i",
  );

// Genética estruturada: rsXXXX seguido de genótipo (G/G, A/T, C/C...).
const _GENETIC_STRUCTURED = /\brs\d{3,}\b[^\n]{0,20}?\b[ACGT]\s*[\/|]\s*[ACGT]\b/i;
// Microbioma estruturado: filo/gênero seguido de percentual.
const _MICROBIOME_STRUCTURED = new RegExp(
  `\\b(${_MICROBIOME_KW})\\b[^\\n]{0,20}?${_NUM}\\s*%`,
  "i",
);

function messageCarriesReport(text: string, filesCount: number): boolean {
  if (filesCount > 0) return true;
  if (!text) return false;

  // Sinal 1 (mais forte): estrutura tabular reconhecida pelo parser existente.
  if (extractMarkersFromText(text).length >= 3) return true;

  // Sinal 2: palavra-chave PRÓXIMA a valor+unidade (laudo sem bullets).
  const structuredHits =
    (_near(_LAB_KW).test(text) ? 1 : 0) +
    (_near(_GENETIC_KW).test(text) ? 1 : 0) +
    (_near(_MICROBIOME_KW).test(text) ? 1 : 0) +
    (_GENETIC_STRUCTURED.test(text) ? 1 : 0) +
    (_MICROBIOME_STRUCTURED.test(text) ? 1 : 0);

  if (structuredHits >= 2) return true;
  if (text.length > 800 && structuredHits >= 1) return true;
  return false;
}

function tryExtractLabReportError(text: string): string | null {
  if (!text) return null;
  const tryParse = (raw: string): string | null => {
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.error === true && parsed?.error_type === "not_a_lab_report") {
        return parsed.message || "Imagem não reconhecida como laudo laboratorial.";
      }
    } catch { /* ignore */ }
    return null;
  };

  // 1) ```json blocks
  const blockRe = /```(?:json)?\s*([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(text))) {
    const r = tryParse(m[1].trim());
    if (r) return r;
  }

  // 2) Raw JSON anywhere no texto contendo "not_a_lab_report"
  const idx = text.indexOf('"not_a_lab_report"');
  if (idx !== -1) {
    const start = text.lastIndexOf("{", idx);
    const end = text.indexOf("}", idx);
    if (start !== -1 && end !== -1) {
      const r = tryParse(text.slice(start, end + 1));
      if (r) return r;
    }
  }

  return null;
}

/**
 * Scanner balanceado: a partir do `{` em startIdx, encontra o `}` correspondente
 * respeitando strings JSON (com escapes). Retorna o índice do `}` ou -1.
 */
function findMatchingBrace(text: string, startIdx: number): number {
  if (text[startIdx] !== "{") return -1;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = startIdx; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) { escaped = false; continue; }
      if (ch === "\\") { escaped = true; continue; }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Remove a seção de formulações antes do fallback heurístico varrer. */
function truncateBeforeFormulations(text: string): string {
  let cutoff = text.length;
  const markerIdx = text.search(/<!--\s*FORMULACOES_SUGERIDAS/i);
  if (markerIdx !== -1) cutoff = Math.min(cutoff, markerIdx);
  const headingIdx = text.search(/^#{1,6}\s*(Formula[cç][aã]o|Formula[cç][oõ]es|Sugest[oõ]es de Formula)/im);
  if (headingIdx !== -1) cutoff = Math.min(cutoff, headingIdx);
  return text.slice(0, cutoff);
}

function tryExtractMarkers(text: string): Marker[] | null {
  // Se for detectado um erro de "não é um laudo", não tentamos extrair marcadores
  if (tryExtractLabReportError(text)) return null;

  // 1) ```json blocks containing { "markers": [...] }
  const blockRe = /```(?:json)?\s*([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(text))) {
    try {
      const parsed = JSON.parse(m[1].trim());
      if (Array.isArray(parsed?.markers)) return parsed.markers as Marker[];
    } catch (err) {
      console.warn("[tryExtractMarkers] JSON block parse falhou:", err, m[1].slice(0, 200));
    }
  }
  // 2) { "markers": [...] } solto no texto — scanner balanceado consciente de strings/escapes
  const idx = text.indexOf('"markers"');
  if (idx !== -1) {
    const start = text.lastIndexOf("{", idx);
    if (start !== -1) {
      const end = findMatchingBrace(text, start);
      if (end !== -1) {
        try {
          const parsed = JSON.parse(text.slice(start, end + 1));
          if (Array.isArray(parsed?.markers)) return parsed.markers as Marker[];
        } catch (err) {
          console.warn("[tryExtractMarkers] JSON inline parse falhou:", err, text.slice(start, Math.min(end + 1, start + 200)));
        }
      } else {
        console.warn("[tryExtractMarkers] chave de abertura sem fechamento balanceado a partir de", start);
      }
    }
  }
  // 3) Fallback heurístico — somente sobre o trecho ANTES da seção de formulações,
  // pra nunca engolir receitas se os estágios 1/2 falharem.
  const safeText = truncateBeforeFormulations(text);
  const fromText = extractMarkersFromText(safeText);
  return fromText.length ? fromText : null;
}

function getDifyAnswer(evt: Record<string, unknown>): string {
  const direct = evt.answer ?? evt.text ?? evt.content;
  if (typeof direct === "string") return direct;
  const data = evt.data;
  if (data && typeof data === "object") {
    const nested = data as Record<string, unknown>;
    const value = nested.answer ?? nested.text ?? nested.content;
    if (typeof value === "string") return value;
  }
  return "";
}

export function useDifyChat(
  patientId: string,
  options?: { readOnly?: boolean; forceChatId?: string | null; initialAgentType?: string },
) {
  const readOnly = options?.readOnly ?? false;
  const forceChatId = options?.forceChatId ?? null;
  const [chatId, setChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [thinking, setThinking] = useState(false);
  const [thinkingMode, setThinkingMode] = useState<"analysis" | "simple">("analysis");
  const [error, setError] = useState<string | null>(null);
  const [agentType, setAgentType] = useState<string>(options?.initialAgentType ?? "");
  const agentTypeState = agentType;
  const [examContext, setExamContext] = useState<ExamContext | null>(null);
  const [uploadProgress, setUploadProgress] = useState<AttachmentProgressItem[]>([]);
  const conversationIdRef = useRef<string | null>(null);
  // Mapa { agent_id -> dify_conversation_id } para retomar a sessão correta
  // do Dify ao alternar entre agentes no mesmo chat (preserva contexto).
  const conversationMapRef = useRef<Record<string, string>>({});
  const [activeAgents, setActiveAgents] = useState<string[]>([]);
  // Super Agente: task_key pendente para próxima mensagem. Setado por quem
  // clicou num super_agent_card (home/next-steps). É consumido em cada envio
  // e mantido enquanto o usuário permanecer no mesmo agente. Trocar de
  // agente (switchAgent) o limpa — a tarefa pertence ao super agente atual.
  const selectedTaskRef = useRef<string | null>(null);
  // Espelho reativo do task selecionado para consumo em UI (badges/indicadores).
  const [selectedTask, setSelectedTaskState] = useState<string | null>(null);
  const researchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const researchSavedRef = useRef<boolean>(false);
  const assistantSavedRef = useRef<boolean>(false);
  const currentFullTextRef = useRef<string>("");
  // Espelha o estado de `thinking` em ref para uso síncrono dentro do init().
  // Usado para impedir que uma re-execução do init (ex.: troca de role/readOnly
  // durante TOKEN_REFRESHED) sobrescreva o stream em andamento com um snapshot
  // vazio do banco antes do message_end propagar no PostgREST.
  const thinkingRef = useRef<boolean>(false);
  useEffect(() => { thinkingRef.current = thinking; }, [thinking]);
  const metaRef = useRef<{
    nutritionist_name: string;
    nutritionist_email: string;
    nutritionist_crn: string;
    nutritionist_pronoun: string;
    clinic_name: string;
    clinic_phone: string;
    clinic_logo_url: string;
    patient_name: string;
    patient_id: string;
    patient_sex: string;
    patient_profile: string;
    patient_age: string;
    gestante_tipo: string;
    gestante_periodo: string;
    fase_ciclo: string;
  }>({
    nutritionist_name: "",
    nutritionist_email: "",
    nutritionist_crn: "",
    nutritionist_pronoun: "",
    clinic_name: "",
    clinic_phone: "",
    clinic_logo_url: "",
    patient_name: "",
    patient_id: patientId,
    patient_sex: "",
    patient_profile: "",
    patient_age: "",
    gestante_tipo: "",
    gestante_periodo: "",
    fase_ciclo: "",
  });

  // Load or create chat for this patient
  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      // Defesa em profundidade: se há stream ativo, NÃO rebusca histórico do
      // banco — o snapshot do PostgREST pode estar atrasado em relação ao
      // estado local e sobrescreveria a mensagem em construção.
      if (thinkingRef.current) return;

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Em modo somente-leitura (admin/super_admin auditando), buscamos o
      // chat mais recente do paciente sem filtrar por created_by — assim o
      // auditor enxerga a conversa do nutricionista responsável.
      // Se forceChatId for passado (ex: vindo da auditoria de feedback),
      // carregamos exatamente aquele chat.
      // Se forceChatId for passado, carrega exatamente aquele chat.
      // Caso contrário, prefere o chat com MAIOR atividade (última mensagem
      // mais recente) — assim "Novo Chat" vazio não esconde o histórico antigo.
      let chosenChat: { id: string; dify_conversation_id: string | null; exam_context: any; dify_conversations: any; agent_type?: string | null; selected_task?: string | null } | null = null;

      if (forceChatId) {
        const { data } = await (supabase as any)
          .from("patient_chats")
          .select("id, dify_conversation_id, exam_context, dify_conversations, agent_type, selected_task, created_by")
          .eq("patient_id", patientId)
          .eq("id", forceChatId)
          .maybeSingle();
        if (data) chosenChat = { id: data.id, dify_conversation_id: data.dify_conversation_id, exam_context: data.exam_context, dify_conversations: data.dify_conversations, agent_type: data.agent_type, selected_task: data.selected_task };
      } else {
        let listQuery = (supabase as any)
          .from("patient_chats")
          .select("id, dify_conversation_id, exam_context, dify_conversations, agent_type, selected_task, created_by, created_at")
          .eq("patient_id", patientId)
          .order("created_at", { ascending: false });
        if (!readOnly) listQuery = listQuery.eq("created_by", user.id);
        const { data: chats } = await listQuery;
        const list = (chats as Array<{ id: string; dify_conversation_id: string | null; exam_context: any; dify_conversations: any; agent_type?: string | null; selected_task?: string | null }>) ?? [];
        if (list.length > 0) {
          const { data: lastMsg } = await (supabase as any)
            .from("chat_messages")
            .select("chat_id, created_at")
            .in("chat_id", list.map((c) => c.id))
            .order("created_at", { ascending: false })
            .limit(1);
          const lastChatId = (lastMsg as Array<{ chat_id: string }> | null)?.[0]?.chat_id;
          chosenChat = list.find((c) => c.id === lastChatId) ?? list[0];
        }
      }

      const [{ data: profile }, { data: patient }] = await Promise.all([
        (supabase as any)
          .from("profiles")
          .select("full_name, email, professional_id, pronoun, clinic_name, phone, clinic_logo_url")
          .eq("id", user.id)
          .maybeSingle(),
        (supabase as any)
          .from("patients")
          .select("name, birth_date, menstrual_cycle_phase")
          .eq("id", patientId)
          .maybeSingle(),
      ]);

      const bd = patient?.birth_date as string | null | undefined;
      let patient_age = "";
      if (bd) {
        const d = new Date(bd);
        if (!Number.isNaN(d.getTime())) {
          const now = new Date();
          let y = now.getFullYear() - d.getFullYear();
          const m = now.getMonth() - d.getMonth();
          if (m < 0 || (m === 0 && now.getDate() < d.getDate())) y--;
          if (y >= 0) patient_age = String(y);
        }
      }

      metaRef.current = {
        ...metaRef.current,
        nutritionist_name: (profile?.full_name as string) || (profile?.email as string) || "Nutricionista",
        nutritionist_email: (profile?.email as string) || "",
        nutritionist_crn: (profile?.professional_id as string) || "",
        nutritionist_pronoun: (profile?.pronoun as string) || "Nutri",
        clinic_name: (profile?.clinic_name as string) || "",
        clinic_phone: (profile?.phone as string) || "",
        clinic_logo_url: (profile?.clinic_logo_url as string) || "",
        patient_name: (patient?.name as string) || "Paciente",
        patient_id: patientId,
        patient_age,
        fase_ciclo: (patient?.menstrual_cycle_phase as string) || "",
      };

      let id = chosenChat?.id;
      if (!id) {
        if (readOnly) {
          if (!cancelled) setChatId("");
          return;
        }
        const { data: created, error: cErr } = await (supabase as any)
          .from("patient_chats")
          .insert({ patient_id: patientId, created_by: user.id })
          .select("id, dify_conversation_id, dify_conversations")
          .single();
        if (cErr) { setError(cErr.message); return; }
        id = created.id;
        conversationMapRef.current = {};
      } else {
        const rawMap = (chosenChat as any).dify_conversations;
        const map: Record<string, string> =
          rawMap && typeof rawMap === "object" && !Array.isArray(rawMap) ? { ...rawMap } : {};
        conversationMapRef.current = map;
        // conversationIdRef será ajustado abaixo com base no agente final.
        conversationIdRef.current = chosenChat!.dify_conversation_id ?? "";
        if (chosenChat!.exam_context) setExamContext(chosenChat!.exam_context as ExamContext);
      }
      if (cancelled || !id) return;
      setChatId(id);

      const { data: msgs } = await (supabase as any)
        .from("chat_messages")
        .select("id, role, content, agent_type, structured_data, attachments, created_at")
        .eq("chat_id", id)
        .order("created_at", { ascending: true });
      if (!cancelled) {
        const loadedMessages = (msgs as ChatMessage[]) ?? [];
        setMessages(loadedMessages);
        const lastMsgWithAgent = (msgs as any[])?.slice().reverse().find(m => m.agent_type);
        // Prioridade: agent_type salvo em patient_chats > agente da última mensagem.
        // Isso preserva a seleção do usuário mesmo em chats sem mensagens ainda.
        const storedAgent = (chosenChat as any)?.agent_type as string | null | undefined;
        const resolvedAgent = (storedAgent && storedAgent.trim()) || lastMsgWithAgent?.agent_type || "";
        if (resolvedAgent) {
          setAgentType(resolvedAgent);
          // Rehidrata o conversation_id do agente atual a partir do mapa.
          const mapped = conversationMapRef.current[resolvedAgent];
          if (mapped) conversationIdRef.current = mapped;
        } else {
          setAgentType(""); // Garante que comece vazio se não houver histórico de agente na conversa
        }
        // Rehidrata selected_task (Super Agentes).
        const storedTask = (chosenChat as any)?.selected_task as string | null | undefined;
        if (storedTask && storedTask.trim()) {
          selectedTaskRef.current = storedTask.trim();
          setSelectedTaskState(storedTask.trim());
        }
        setActiveAgents(Object.keys(conversationMapRef.current));

        // Reconstitui o contexto a partir da última análise real de exame.
        // Isso corrige conversas em que um follow-up simples sobrescreveu
        // patient_chats.exam_context com uma resposta fria do tipo "envie o laudo".
        const storedCtx = (chosenChat?.exam_context as ExamContext | null) ?? null;
        const lastValidExamAnalysis = loadedMessages
          .slice()
          .reverse()
          .find(hasExamMarkersMessage);
        if (lastValidExamAnalysis) {
          const repairedCtx = buildExamContextFromAnalysis({
            text: lastValidExamAnalysis.content,
            markers: lastValidExamAnalysis.structured_data?.markers ?? [],
            meta: metaRef.current,
            agentType: lastValidExamAnalysis.agent_type,
            previous: storedCtx,
          });
          setExamContext(repairedCtx);
          if (id && storedCtx?.resumo_texto !== repairedCtx.resumo_texto) {
            void (supabase as any)
              .from("patient_chats")
              .update({ exam_context: repairedCtx })
              .eq("id", id);
          }
        }
      }
    };
    init();
    return () => { 
      cancelled = true; 
      if (researchTimeoutRef.current) {
        clearTimeout(researchTimeoutRef.current);
      }
    };
  }, [patientId, readOnly, forceChatId]);

  const { getCost, consume } = useCreditsActions();
  const { refetch: refetchCredits } = useMyCredits();

  const sendMessage = useCallback(async (
    text: string,
    files: File[],
    opts?: { overrideAgent?: string; extraInputs?: Record<string, unknown>; displayText?: string; selectedTask?: string },
  ) => {
    if (!chatId || readOnly) return;
    // Permite forçar o agente alvo (usado pelo handoff "Gerar receita") sem
    // depender do flush do setState do React.
    const agentType = opts?.overrideAgent ?? agentTypeState;
    // Super Agentes: `selectedTask` roteia a esteira interna do app Dify e
    // define a chave financeira. Ausente para agentes comuns → comportamento
    // idêntico ao de hoje (billingKey resolve pelo agent_id).
    // Fallback: se opts.selectedTask não veio, usa o task pendente setado
    // externamente (por ex.: clique num super_agent_card na home).
    const selectedTask =
      opts?.selectedTask?.trim() || selectedTaskRef.current?.trim() || undefined;

    // Gate de sessão única: aborta se outro dispositivo assumiu o login
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    if (!currentUser) return;
    const sessionOk = await enforceSessionGuard(currentUser.id);
    if (!sessionOk) return;

    // Super Agentes exigem `selected_task` obrigatoriamente. O Dify retorna
    // 400 "selected_task is required in input form" se faltar → o assistente
    // não responde. Validamos antes de gastar recursos/streaming.
    if (agentType && !selectedTask) {
      const { data: agentRow } = await (supabase as any)
        .from("dify_agents")
        .select("is_super_agent")
        .eq("agent_id", agentType)
        .maybeSingle();
      if (agentRow?.is_super_agent === true) {
        toast.error("Escolha uma tarefa do Super Agente antes de enviar (ex: Exames de Sangue).");
        return;
      }
    }



    const billingKey = resolveAgentKey(agentType, selectedTask ? { isSuperAgent: true, selectedTask } : undefined);
    if (billingKey) {
      try {
        const { cost, label } = await getCost(billingKey);
        if (cost > 0) {
          const fresh = await refetchCredits();
          const balance = fresh.data?.balance ?? 0;
          const unlimited = (fresh.data as any)?.unlimited === true;
          if (!unlimited && balance < cost) {
            paywallStore.open(cost, balance, label);
            return;
          }
        }

      } catch (e) {
        console.warn("[credits] pré-check falhou, prosseguindo:", e);
      }
    }


    setError(null);
    setThinking(true);
    setThinkingMode(files.length > 0 ? "analysis" : "simple");
    researchSavedRef.current = false;
    assistantSavedRef.current = false;
    currentFullTextRef.current = "";
    if (researchTimeoutRef.current) {
      clearTimeout(researchTimeoutRef.current);
      researchTimeoutRef.current = null;
    }
    if (files.length > 0) {
      setUploadProgress(files.map((file) => ({
        id: `${file.name}-${file.size}-${file.lastModified}`,
        name: file.name,
        size: file.size,
        type: file.type,
        stage: "enviando",
        progress: 8,
        message: "Preparando envio do exame",
      })));
    }
    const startedAt = performance.now();

    const updateFileProgress = (file: File, stage: AttachmentProgressStage, progress: number, message?: string) => {
      const id = `${file.name}-${file.size}-${file.lastModified}`;
      setUploadProgress((prev) => prev.map((item) => (
        item.id === id ? { ...item, stage, progress, message } : item
      )));
    };

    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    const { data: { user } } = await supabase.auth.getUser();
    if (!token || !user) { setThinking(false); setUploadProgress([]); return; }


    // 1) Upload files DIRECT to Supabase Storage and pass signed URLs to Dify
    //    via `transfer_method: "remote_url"`. Isso elimina o proxy /api/dify/upload
    //    (que está sob limite de payload do Cloudflare Worker ~10MB) e o limite
    //    efetivo passa a ser o do próprio Dify, suportando PDFs grandes de exame.
    const difyFiles: DifyFileRef[] = [];
    const attachments: Array<{ name: string; path?: string; mime_type?: string }> = [];
    let lastExamId: string | null = null;
    const resetUploadUI = () => setUploadProgress([]);

    for (const file of files) {
      const toastId = `upload-${file.name}-${Date.now()}`;
      updateFileProgress(file, "enviando", 20, "Salvando exame no histórico");
      toast.loading(`Enviando ${file.name}...`, { id: toastId });

      // Storage (upload direto do browser → Supabase, sem passar pelo Worker).
      // Supabase Storage rejeita caracteres fora de [A-Za-z0-9._-] na key
      // (colchetes, acentos, etc. → "Invalid key"). Sanitizamos o filename
      // preservando extensão; o nome original vai em `attachments[].name`.
      const safeName = sanitizeFilename(file.name);
      const path = `${user.id}/${patientId}/${Date.now()}-${safeName}`;
      const { error: upErr } = await supabase.storage.from("exams").upload(path, file, {
        contentType: file.type || undefined,
        upsert: false,
      });
      if (upErr) {
        updateFileProgress(file, "erro", 100, "Falha ao salvar exame");
        toast.error(`Falha ao salvar ${file.name}: ${upErr.message}`, { id: toastId });
        setError(upErr.message);
        setThinking(false);
        resetUploadUI();
        return;
      }

      updateFileProgress(file, "processando", 60, "Gerando link seguro para a Lumma");

      // Signed URL (1h) — Dify baixa o arquivo direto do Supabase Storage
      const { data: signed, error: signErr } = await supabase.storage
        .from("exams")
        .createSignedUrl(path, 3600);
      if (signErr || !signed?.signedUrl) {
        updateFileProgress(file, "erro", 100, "Falha ao gerar link de acesso");
        toast.error(`Falha ao preparar ${file.name}`, { id: toastId });
        setError(signErr?.message ?? "Falha ao gerar URL assinada");
        setThinking(false);
        resetUploadUI();
        return;
      }

      const { data: examIns } = await (supabase as any).from("patient_exams").insert({
        patient_id: patientId,
        chat_id: chatId,
        uploaded_by: user.id,
        file_path: path,
        file_name: file.name,
        mime_type: file.type,
        size_bytes: file.size,
        dify_file_id: null,
      }).select("id").single();
      if (examIns?.id) lastExamId = examIns.id as string;

      difyFiles.push({
        type: file.type.startsWith("image/") ? "image" : "document",
        transfer_method: "remote_url",
        url: signed.signedUrl,
      });
      attachments.push({ name: file.name, path, mime_type: file.type });
      updateFileProgress(file, "concluido", 100, "Upload concluído; aguardando análise");
      toast.success(`${file.name} enviado`, { id: toastId, duration: 2500 });
    }

    // 2) Persist user message — usa displayText (texto amigável) quando o
    // chamador quer esconder o prompt técnico enviado ao Dify (ex: handoff).
    const displayContent = opts?.displayText ?? text;
    const userMsgPayload = {
      chat_id: chatId,
      created_by: user.id,
      role: "user" as const,
      content: displayContent,
      agent_type: agentType,
      selected_task: selectedTask ?? null,
      attachments: attachments.length ? attachments : null,
    };
    const { data: userInserted } = await (supabase as any)
      .from("chat_messages").insert(userMsgPayload).select("id").single();


    // Só define título na primeira mensagem do usuário se for agente research
    const isFirstUserMessage = messages.length === 0;
    
    if (isFirstUserMessage && agentType === 'research') {
      const title = displayContent.trim().slice(0, 60);
      await (supabase as any)
        .from("patient_chats")
        .update({ title })
        .eq("id", chatId);
    }
    const userMsg: ChatMessage = {
      id: userInserted?.id ?? crypto.randomUUID(),
      role: "user",
      content: displayContent,
      attachments: attachments.length ? attachments : null,
      created_at: new Date().toISOString(),
    };

    // 3) Placeholder assistant message
    const assistantId = crypto.randomUUID();

    const saveAssistantToSupabase = async (rawContent: string, convId?: string) => {
      const content = stripAgentScaffolding(rawContent);
      if (!content.trim() && !convId) return;

      if (convId) {
        conversationIdRef.current = convId;
        if (agentType) {
          conversationMapRef.current = { ...conversationMapRef.current, [agentType]: convId };
          setActiveAgents(Object.keys(conversationMapRef.current));
        }
        await (supabase as any)
          .from("patient_chats")
          .update({
            dify_conversation_id: convId,
            dify_conversations: conversationMapRef.current,
          })
          .eq("id", chatId);
      }

      const processingMs = Math.round(performance.now() - startedAt);
      const structured = { processing_ms: processingMs };

      const { data: assistantInserted } = await (supabase as any)
        .from("chat_messages")
        .insert({
          chat_id: chatId,
          created_by: user.id,
          role: "assistant",
          content: content,
          agent_type: agentType,
          selected_task: selectedTask ?? null,
          structured_data: structured,
        })
        .select("id")
        .single();

      if (assistantInserted?.id) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, id: assistantInserted.id, structured_data: structured } : m
          )
        );
      }
    };

    setMessages((prev) => [...prev, { ...userMsg, agent_type: agentType }, { id: assistantId, role: "assistant", content: "", agent_type: agentType, created_at: new Date().toISOString() }]);

    // 4) Stream from Dify proxy
    let assistantText = "";
    const buildContextPrefix = (ctx: ExamContext): string => {
      const alteracoes = ctx?.alteracoes ?? [];
      const otimos = ctx?.otimos ?? [];

      const lines = [
        `[CONTEXTO DO PACIENTE]`,
        `Use este contexto como fonte da conversa. Se a pergunta puder ser respondida com os dados abaixo, não peça o laudo novamente.`,
        `Paciente: ${ctx.patient_name}`,
        `Perfil: ${ctx.patient_profile} | Sexo: ${ctx.patient_sex}${ctx.patient_age ? ` | Idade: ${ctx.patient_age} anos` : ""}`,
      ];
      if (alteracoes.length > 0) {
        lines.push(`Marcadores alterados: ${alteracoes.join(", ")}`);
      }
      if (otimos.length > 0) {
        lines.push(`Marcadores ótimos: ${otimos.join(", ")}`);
      }
      // Além dos marcadores resumidos, mantemos a análise textual anterior como
      // fonte completa. Só marcadores alterados/ótimos não bastam para perguntas
      // seletivas como "traga hemograma/anemia", porque esses dados podem estar
      // normais e não aparecer no resumo estruturado.
      if (ctx.resumo_texto) {
        lines.push(`Análise completa do exame anterior:`);
        lines.push(ctx.resumo_texto);
      }
      lines.push(`[FIM DO CONTEXTO]`);
      lines.push(""); // linha em branco antes da pergunta
      return lines.join("\n");
    };

    const buildMinimalPrefix = (): string => {
      const meta = metaRef.current;
      if (!meta.patient_name && !meta.patient_profile) return "";
      
      return [
        `[CONTEXTO DO PACIENTE]`,
        `Paciente: ${meta.patient_name}`,
        `Perfil: ${meta.patient_profile}`,
        `Sexo: ${meta.patient_sex}`,
        meta.patient_age ? `Idade: ${meta.patient_age} anos` : "",
        meta.gestante_tipo 
          ? `Gestação: ${meta.gestante_tipo} — ${meta.gestante_periodo}` 
          : "",
        `[FIM DO CONTEXTO]`,
        ""
      ].filter(Boolean).join("\n");
    };

    try {
      const latestExamMessage = messages.slice().reverse().find(hasExamMarkersMessage);
      const latestMarkers: Marker[] = latestExamMessage?.structured_data?.markers ?? [];
      const latestContextFromMessages = latestExamMessage
        ? buildExamContextFromAnalysis({
            text: latestExamMessage.content,
            markers: latestMarkers,
            meta: metaRef.current,
            agentType: latestExamMessage.agent_type,
            previous: examContext,
          })
        : null;
      const effectiveExamContext = latestContextFromMessages ?? examContext;

      // Se a mensagem já carrega o laudo/exame (arquivo OU texto colado
      // com estrutura de laudo), suprime o prefixo automático — o
      // conteúdo principal já veio na mensagem e o prefixo antigo só
      // contaminaria o prompt do agente atual (ex.: Genética recebendo
      // "Marcadores laboratoriais alterados: ..." em cima de um laudo genético).
      const carriesReport = messageCarriesReport(text, difyFiles.length);

      const finalQuery = (() => {
        // exam_*: comportamento ORIGINAL preservado (não passa pelo dispatcher).
        if (agentType.startsWith("exam")) {
          if (!carriesReport && effectiveExamContext) return buildContextPrefix(effectiveExamContext) + text;
          return text;
        }
        // research: sem prefixo (busca pura).
        if (agentType === "research") return text;

        // Demais agentes: se a mensagem já traz laudo, não prefixa.
        if (carriesReport) return text;

        // Dispatcher: tenta builder especializado por agente.
        // Fallback duplo: builder específico → builder padrão → minimal.
        try {
          const specialized = effectiveExamContext
            ? buildAgentContextPrefix(agentType, {
                examContext: effectiveExamContext,
                markers: latestMarkers,
              })
            : null;
          if (specialized) return specialized + text;
          return (effectiveExamContext
              ? buildContextPrefix(effectiveExamContext)
              : buildMinimalPrefix()) + text;
        } catch (e) {
          console.error('[finalQuery error]', e);
          return buildMinimalPrefix() + text;
        }
      })();
      
      
      const difyQuery = finalQuery || text;

      const callDify = async (convId: string | undefined) =>

        fetch("/api/dify/chat", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            query: difyQuery,
            conversation_id: convId,
            files: difyFiles,
            meta: metaRef.current,
            agent_type: agentType,
            ...(selectedTask ? { selected_task: selectedTask } : {}),
            ...(opts?.extraInputs ? { inputs: opts.extraInputs } : {}),
          }),
        });

      // Em conversas antigas, o Dify pode ter salvo o conversation_id com outro `user`.
      // Ao anexar exame, abrimos uma nova conversa Dify com o UUID correto e mantemos o contexto via meta.
      const initialConv = difyFiles.length ? undefined : conversationIdRef.current || undefined;
      let res = await callDify(initialConv);

      // Se o Dify rejeitar o conversation_id (404 / "Conversation Not Exists"),
      // limpamos a referência (e a entrada do mapa) e abrimos nova conversa.
      if (res.status === 404) {
        conversationIdRef.current = "";
        if (conversationMapRef.current[agentType]) {
          const { [agentType]: _dead, ...rest } = conversationMapRef.current;
          conversationMapRef.current = rest;
          setActiveAgents(Object.keys(rest));
          if (chatId) {
            (supabase as any)
              .from("patient_chats")
              .update({ dify_conversation_id: null, dify_conversations: rest })
              .eq("id", chatId)
              .then(() => {});
          }
        }
        res = await callDify(undefined);
      }


      if (!res.ok) {
        setThinking(false);
        setError(`Erro na Lumma (${res.status})`);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        setThinking(false);
        return;
      }

      const decoder = new TextDecoder();
      let fullText = "";
      let sseBuffer = "";
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        sseBuffer += decoder.decode(value, { stream: true });
        const lines = sseBuffer.split("\n");
        sseBuffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr || jsonStr === "[DONE]") continue;

          try {
            const data = JSON.parse(jsonStr);
            
            if (data.event === "message" || data.event === "agent_message" || data.event === "agent_thought" || data.event === "text_chunk") {
              let text = "";
              if (data.event === "text_chunk") {
                text = data.text || data.data?.text || data.delta?.text || "";
              } else {
                text = getDifyAnswer(data);
              }

              if (text) {
                fullText += text;
                currentFullTextRef.current = fullText;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId ? { ...m, content: fullText } : m
                  )
                );

                // Lógica de salvamento por timeout para research
                if (agentType === 'research') {
                  if (researchTimeoutRef.current) {
                    clearTimeout(researchTimeoutRef.current);
                  }
                  researchTimeoutRef.current = setTimeout(async () => {
                    if (!researchSavedRef.current && currentFullTextRef.current.length > 200) {
                      researchSavedRef.current = true;
                      await saveAssistantToSupabase(currentFullTextRef.current, data.conversation_id);
                    }
                  }, 15000);
                }
              }
            } else if (data.event === "message_end" || data.event === "workflow_finished") {
              if (researchTimeoutRef.current) {
                clearTimeout(researchTimeoutRef.current);
                researchTimeoutRef.current = null;
              }
              if (agentType === "research") {
                if (!researchSavedRef.current) {
                  researchSavedRef.current = true;
                  await saveAssistantToSupabase(fullText, data.conversation_id);
                }
              } else {
                if (!assistantSavedRef.current) {
                  assistantSavedRef.current = true;
                  if (data.conversation_id) {
                    conversationIdRef.current = data.conversation_id;
                    if (agentType) {
                      conversationMapRef.current = { ...conversationMapRef.current, [agentType]: data.conversation_id };
                      setActiveAgents(Object.keys(conversationMapRef.current));
                    }
                    await (supabase as any)
                      .from("patient_chats")
                      .update({
                        dify_conversation_id: data.conversation_id,
                        dify_conversations: conversationMapRef.current,
                      })
                      .eq("id", chatId);
                  }

                  // Extract markers if in exam mode
                  const markers: Marker[] | null = agentType?.startsWith("exam") 
                    ? tryExtractMarkers(fullText) 
                    : null;

                  const processingMs = Math.round(performance.now() - startedAt);
                  const labReportError = agentType?.startsWith("exam") ? tryExtractLabReportError(fullText) : null;

                  // Extrai o marcador <!--FORMULACOES_SUGERIDAS:{...}--> emitido
                  // pelos agentes de exame (handoff "Gerar receita").
                  const formulacoes = agentType?.startsWith("exam")
                    ? extractFormulacoes(fullText)
                    : null;

                  const structured: Record<string, unknown> = labReportError
                    ? { not_a_lab_report_error: labReportError, processing_ms: processingMs }
                    : (markers
                        ? { markers, processing_ms: processingMs }
                        : { processing_ms: processingMs });
                  if (formulacoes) structured.formulacoes_sugeridas = formulacoes;

                  // Save final assistant message
                  const { data: assistantInserted } = await (supabase as any)
                    .from("chat_messages")
                    .insert({
                      chat_id: chatId,
                      created_by: user.id,
                      role: "assistant",
                      content: fullText,
                      agent_type: agentType,
                      selected_task: selectedTask ?? null,
                      structured_data: structured,
                    })
                    .select("id")
                    .single();

                  if (assistantInserted?.id) {
                    setMessages((prev) =>
                      prev.map((m) =>
                        m.id === assistantId ? { ...m, id: assistantInserted.id, structured_data: structured } : m
                      )
                    );
                  }

                  // Débito de créditos APÓS resposta completa
                  if (billingKey && fullText.trim() && !labReportError) {
                    try {
                      await consume(billingKey, text.slice(0, 200));
                    } catch (e) {
                      console.warn("[credits] débito falhou (sem cobrança):", e);
                    }
                  }

                  if (markers && markers.length > 0 && agentType?.startsWith("exam")) {
                    await processAndPersistMarkers({
                      userId: user.id,
                      patientId,
                      examId: lastExamId,
                      chatId,
                      rawMarkers: markers as unknown as RawMarker[],
                      source: "chat",
                      agentType,
                    });
                  }

                  // Salva contexto apenas quando a resposta é uma análise real
                  // de exame (upload novo ou marcadores extraídos). Follow-ups
                  // simples não podem apagar o contexto clínico anterior.
                  const shouldRefreshExamContext =
                    agentType?.startsWith("exam") &&
                    fullText.trim() &&
                    !labReportError &&
                    (difyFiles.length > 0 || (markers && markers.length > 0));

                  if (shouldRefreshExamContext) {
                    const newCtx = buildExamContextFromAnalysis({
                      text: fullText,
                      markers: markers ?? [],
                      meta: metaRef.current,
                      agentType,
                      previous: examContext,
                    });
                    setExamContext(newCtx);
                    await (supabase as any)
                      .from("patient_chats")
                      .update({ exam_context: newCtx })
                      .eq("id", chatId);
                  }
                }
              }
            }
          } catch (e) {
            console.error("Error parsing Dify stream:", e);
          }
        }
      }

      // Stream encerrou sem 'message_end' (timeout do proxy, conexão cortada, etc.).
      // Salva o conteúdo parcial recebido em vez de descartar tudo.
      if (!assistantSavedRef.current && fullText.trim() && agentType !== 'research') {
        assistantSavedRef.current = true;
        console.warn('[dify] stream encerrado sem message_end — salvando conteúdo parcial');
        const partialNote = "\n\n⚠️ *Análise interrompida antes do encerramento. O conteúdo acima é parcial — reenvie o exame para gerar a análise completa.*";
        await saveAssistantToSupabase(fullText + partialNote, conversationIdRef.current || undefined);
      }
    } catch (e: any) {
      // Se o stream caiu com erro mas chegou conteúdo, preserva o parcial.
      if (!assistantSavedRef.current && currentFullTextRef.current.trim() && agentType !== 'research') {
        assistantSavedRef.current = true;
        const partialNote = "\n\n⚠️ *Análise interrompida (" + (e?.message || 'erro de conexão') + "). Conteúdo parcial — reenvie o exame para análise completa.*";
        try {
          await saveAssistantToSupabase(currentFullTextRef.current + partialNote, conversationIdRef.current || undefined);
        } catch {}
      }
      setError(e.message);
    } finally {
      if (researchTimeoutRef.current && !researchSavedRef.current && agentType === 'research' && currentFullTextRef.current.length > 200) {
        // Tenta um save final no erro se tiver conteúdo mínimo
        const textToSave = currentFullTextRef.current;
        researchSavedRef.current = true;
        saveAssistantToSupabase(textToSave);
      }
      setThinking(false);
      setUploadProgress([]);
    }
  }, [chatId, patientId, readOnly, agentType, examContext, messages, getCost, consume, refetchCredits]);

  const resetChat = useCallback(async () => {
    if (readOnly) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: created, error: cErr } = await (supabase as any)
      .from("patient_chats")
      .insert({ patient_id: patientId, created_by: user.id })
      .select("id")
      .single();
    if (cErr) { setError(cErr.message); return; }
    conversationIdRef.current = "";
    conversationMapRef.current = {};
    selectedTaskRef.current = null;
    setSelectedTaskState(null);
    setActiveAgents([]);
    setMessages([]);
    setError(null);
    setAgentType("exam");
    setExamContext(null);
    setChatId(created.id as string);
  }, [patientId, readOnly]);

  const setSelectedTask = useCallback((taskKey: string | null) => {
    const norm = taskKey?.trim() || null;
    selectedTaskRef.current = norm;
    setSelectedTaskState(norm);
    // Persiste no patient_chats para sobreviver a reload/nova sessão.
    if (chatId) {
      (supabase as any)
        .from("patient_chats")
        .update({ selected_task: norm })
        .eq("id", chatId)
        .then(() => {});
    }
  }, [chatId]);

  const switchAgent = useCallback((next: string) => {
    setAgentType((prev) => {
      if (prev === next) return prev;
      // Trocar de agent_id descarta a task pendente — ela pertencia ao agente anterior.
      selectedTaskRef.current = null;
      setSelectedTaskState(null);

      // Salva o conversation_id atual sob o agente anterior, para que
      // o usuário possa voltar e retomar exatamente de onde parou.
      // IMPORTANTE: cada agente do Dify tem sua própria API key, então
      // só podemos reusar um conversation_id quando estamos no mesmo agente.
      if (prev && conversationIdRef.current) {
        conversationMapRef.current = {
          ...conversationMapRef.current,
          [prev]: conversationIdRef.current,
        };
      }

      // Rehidrata a conversa do agente alvo (se já existir).
      const restored = conversationMapRef.current[next] ?? null;
      conversationIdRef.current = restored;
      setActiveAgents(Object.keys(conversationMapRef.current));

      if (chatId) {
        (supabase as any)
          .from("patient_chats")
          .update({
            dify_conversation_id: restored,
            dify_conversations: conversationMapRef.current,
            agent_type: next,
            selected_task: null,
          })
          .eq("id", chatId)
          .then(() => {});
      }

      return next;
    });
  }, [chatId]);


  const setContext = useCallback((ctx: {
    patient_sex?: string;
    patient_profile?: string;
    gestante_tipo?: string;
    gestante_periodo?: string;
    fase_ciclo?: string;
  }) => {
    metaRef.current = {
      ...metaRef.current,
      patient_sex: ctx.patient_sex ?? "",
      patient_profile: ctx.patient_profile ?? "",
      gestante_tipo: ctx.gestante_tipo ?? "",
      gestante_periodo: ctx.gestante_periodo ?? "",
      fase_ciclo: ctx.fase_ciclo ?? "",
    };
  }, []);

  const removeUploadItem = useCallback((name: string) => {
    setUploadProgress((prev) => prev.filter((item) => item.name !== name));
  }, []);

  /**
   * Handoff entre agentes: troca para `targetAgent`, preserva a sessão
   * Dify do agente anterior no mapa (para retomada futura) e dispara a
   * primeira mensagem já carregando o payload em `inputs.exam_context`.
   */
  const sendHandoff = useCallback(async (
    targetAgent: string,
    extraInputs: Record<string, unknown>,
    query: string,
    opts?: { selectedTask?: string; displayText?: string },
  ) => {
    if (!chatId || readOnly) return;
    // Preserva a conversa do agente atual no mapa antes de trocar.
    const prevAgent = agentType;
    if (prevAgent && conversationIdRef.current) {
      conversationMapRef.current = {
        ...conversationMapRef.current,
        [prevAgent]: conversationIdRef.current,
      };
    }
    // Rehidrata (ou zera) a conversa do agente alvo.
    // Super Agentes: se `targetAgent` for o mesmo agente atual (troca só de
    // tarefa dentro do mesmo super agente), o conversation_id já está preservado
    // por estar mapeado sob a mesma agent_id — nenhuma mudança extra necessária.
    const restored = conversationMapRef.current[targetAgent] ?? null;
    conversationIdRef.current = restored;
    setActiveAgents(Object.keys(conversationMapRef.current));

    if (chatId) {
      await (supabase as any)
        .from("patient_chats")
        .update({
          dify_conversation_id: restored,
          dify_conversations: conversationMapRef.current,
          agent_type: targetAgent,
          selected_task: opts?.selectedTask ?? null,
        })
        .eq("id", chatId);
    }
    // Espelha o task selecionado no state para a UI (badge/chip).
    if (opts?.selectedTask) {
      selectedTaskRef.current = opts.selectedTask;
      setSelectedTaskState(opts.selectedTask);
    }
    setAgentType(targetAgent);
    await sendMessage(query, [], {
      overrideAgent: targetAgent,
      extraInputs,
      displayText: opts?.displayText ?? "Gerar receita",
      selectedTask: opts?.selectedTask,
    });
  }, [chatId, readOnly, sendMessage, agentType]);

  return { chatId, messages, thinking, thinkingMode, error, uploadProgress, removeUploadItem, sendMessage, sendHandoff, resetChat, setContext, agentType, setAgentType: switchAgent, examContext, activeAgents, setSelectedTask, selectedTask };
}
