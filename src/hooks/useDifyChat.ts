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
import { enforceSessionGuard } from "@/lib/session-guard";
import { extractFormulacoes } from "@/lib/formulation-marker";

export interface ExamContext {
  patient_name: string;
  patient_profile: string;
  patient_sex: string;
  gestante_tipo: string;
  gestante_periodo: string;
  exam_date: string;
  alteracoes: string[];
  otimos: string[];
  resumo_clinico: string;
  resumo_texto?: string; // fallback: análise textual completa quando não há marcadores estruturados
  agent_type?: string;
}

interface DifyFileRef {
  type: "image" | "document";
  transfer_method: "local_file";
  upload_file_id: string;
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
    } catch { /* ignore */ }
  }
  // 2) any { "markers": [...] } substring
  const idx = text.indexOf('"markers"');
  if (idx !== -1) {
    const start = text.lastIndexOf("{", idx);
    const end = text.indexOf("}", text.indexOf("]", idx));
    if (start !== -1 && end !== -1) {
      try {
        const parsed = JSON.parse(text.slice(start, end + 1));
        if (Array.isArray(parsed?.markers)) return parsed.markers as Marker[];
      } catch { /* ignore */ }
    }
  }
  // 3) Fallback heurístico — extrai marcadores de respostas em linguagem natural.
  const fromText = extractMarkersFromText(text);
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
      let chosenChat: { id: string; dify_conversation_id: string | null; exam_context: any } | null = null;

      if (forceChatId) {
        const { data } = await (supabase as any)
          .from("patient_chats")
          .select("id, dify_conversation_id, exam_context, created_by")
          .eq("patient_id", patientId)
          .eq("id", forceChatId)
          .maybeSingle();
        if (data) chosenChat = { id: data.id, dify_conversation_id: data.dify_conversation_id, exam_context: data.exam_context };
      } else {
        let listQuery = (supabase as any)
          .from("patient_chats")
          .select("id, dify_conversation_id, exam_context, created_by, created_at")
          .eq("patient_id", patientId)
          .order("created_at", { ascending: false });
        if (!readOnly) listQuery = listQuery.eq("created_by", user.id);
        const { data: chats } = await listQuery;
        const list = (chats as Array<{ id: string; dify_conversation_id: string | null; exam_context: any }>) ?? [];
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
          .select("name, menstrual_cycle_phase")
          .eq("id", patientId)
          .maybeSingle(),
      ]);

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
          .select("id, dify_conversation_id")
          .single();
        if (cErr) { setError(cErr.message); return; }
        id = created.id;
      } else {
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
        setMessages((msgs as ChatMessage[]) ?? []);
        const lastMsgWithAgent = (msgs as any[])?.slice().reverse().find(m => m.agent_type);
        if (lastMsgWithAgent) {
          setAgentType(lastMsgWithAgent.agent_type);
        } else {
          setAgentType(""); // Garante que comece vazio se não houver histórico de agente na conversa
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
    opts?: { overrideAgent?: string; extraInputs?: Record<string, unknown> },
  ) => {
    if (!chatId || readOnly) return;
    // Permite forçar o agente alvo (usado pelo handoff "Gerar receita") sem
    // depender do flush do setState do React.
    const agentType = opts?.overrideAgent ?? agentTypeState;

    // Gate de sessão única: aborta se outro dispositivo assumiu o login
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    if (!currentUser) return;
    const sessionOk = await enforceSessionGuard(currentUser.id);
    if (!sessionOk) return;


    const billingKey = resolveAgentKey(agentType);
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


    // 1) Upload files to Dify + storage
    const difyFiles: DifyFileRef[] = [];
    const attachments: Array<{ name: string }> = [];
    let lastExamId: string | null = null;
    for (const file of files) {
      const toastId = `upload-${file.name}-${Date.now()}`;
      updateFileProgress(file, "enviando", 15, "Salvando exame no histórico");
      toast.loading(`Enviando ${file.name}...`, { id: toastId });

      // Storage
      const path = `${user.id}/${patientId}/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("exams").upload(path, file);
      if (upErr) {
        updateFileProgress(file, "erro", 100, "Falha ao salvar exame");
        toast.error(`Falha ao salvar ${file.name}`, { id: toastId });
        setError(upErr.message); setThinking(false); return;
      }

      updateFileProgress(file, "processando", 45, "Enviando à Lumma");
      toast.loading(`Processando ${file.name} na Lumma...`, { id: toastId });

      // Dify
      const fd = new FormData();
      fd.append("file", file);
      fd.append("agent_type", agentType);
      fd.append("nutritionist_name", metaRef.current.nutritionist_name);
      fd.append("patient_name", metaRef.current.patient_name);
      const res = await fetch("/api/dify/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (!res.ok) {
        updateFileProgress(file, "erro", 100, "Falha ao enviar exame");
        toast.error(`Falha ao enviar ${file.name} (${res.status})`, { id: toastId });
        setError(`Falha ao enviar exame para análise (${res.status})`);
        setThinking(false);
        return;
      }
      const json = await res.json() as { id?: string; mime_type?: string };
      const difyId = json.id;
      updateFileProgress(file, "processando", 70, "Arquivo recebido — analisando");

      const { data: examIns } = await (supabase as any).from("patient_exams").insert({
        patient_id: patientId,
        chat_id: chatId,
        uploaded_by: user.id,
        file_path: path,
        file_name: file.name,
        mime_type: file.type,
        size_bytes: file.size,
        dify_file_id: difyId,
      }).select("id").single();
      if (examIns?.id) lastExamId = examIns.id as string;

      if (difyId) {
        difyFiles.push({
          type: file.type.startsWith("image/") ? "image" : "document",
          transfer_method: "local_file",
          upload_file_id: difyId,
        });
      }
      attachments.push({ name: file.name });
      updateFileProgress(file, "concluido", 100, "Upload concluído; aguardando análise");
      toast.success(`${file.name} enviado`, { id: toastId, duration: 2500 });
    }

    // 2) Persist user message
    const userMsgPayload = {
      chat_id: chatId,
      created_by: user.id,
      role: "user" as const,
      content: text,
      agent_type: agentType,
      attachments: attachments.length ? attachments : null,
    };
    const { data: userInserted } = await (supabase as any)
      .from("chat_messages").insert(userMsgPayload).select("id").single();


    // Só define título na primeira mensagem do usuário se for agente research
    const isFirstUserMessage = messages.length === 0;
    
    if (isFirstUserMessage && agentType === 'research') {
      const title = text.trim().slice(0, 60);
      await (supabase as any)
        .from("patient_chats")
        .update({ title })
        .eq("id", chatId);
    }
    const userMsg: ChatMessage = {
      id: userInserted?.id ?? crypto.randomUUID(),
      role: "user",
      content: text,
      attachments: attachments.length ? attachments : null,
      created_at: new Date().toISOString(),
    };

    // 3) Placeholder assistant message
    const assistantId = crypto.randomUUID();

    const saveAssistantToSupabase = async (content: string, convId?: string) => {
      if (!content.trim() && !convId) return;
      
      if (convId) {
        conversationIdRef.current = convId;
        await (supabase as any)
          .from("patient_chats")
          .update({ dify_conversation_id: convId })
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
        `Paciente: ${ctx.patient_name}`,
        `Perfil: ${ctx.patient_profile} | Sexo: ${ctx.patient_sex}`,
      ];
      if (alteracoes.length > 0) {
        lines.push(`Marcadores alterados: ${alteracoes.join(", ")}`);
      }
      if (otimos.length > 0) {
        lines.push(`Marcadores ótimos: ${otimos.join(", ")}`);
      }
      // Fallback: se não temos marcadores estruturados, injeta a análise textual completa
      // do exame para que o agente tenha contexto clínico real para trabalhar.
      if (alteracoes.length === 0 && otimos.length === 0 && ctx.resumo_texto) {
        lines.push(`Análise do exame anterior:`);
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
        meta.gestante_tipo 
          ? `Gestação: ${meta.gestante_tipo} — ${meta.gestante_periodo}` 
          : "",
        `[FIM DO CONTEXTO]`,
        ""
      ].filter(Boolean).join("\n");
    };

    try {
      const finalQuery = (() => {
        if (agentType.startsWith("exam")) return text;
        if (agentType === "research") return text;
        try {
          return (examContext 
              ? buildContextPrefix(examContext) 
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
            ...(opts?.extraInputs ? { inputs: opts.extraInputs } : {}),
          }),
        });

      // Em conversas antigas, o Dify pode ter salvo o conversation_id com outro `user`.
      // Ao anexar exame, abrimos uma nova conversa Dify com o UUID correto e mantemos o contexto via meta.
      const initialConv = difyFiles.length ? undefined : conversationIdRef.current || undefined;
      let res = await callDify(initialConv);

      // Se o Dify rejeitar o conversation_id (404 / "Conversation Not Exists"),
      // limpamos a referência e abrimos uma nova conversa automaticamente.
      if (res.status === 404) {
        conversationIdRef.current = "";
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
                    await (supabase as any)
                      .from("patient_chats")
                      .update({ dify_conversation_id: data.conversation_id })
                      .eq("id", chatId);
                  }

                  // Extract markers if in exam mode
                  const markers: Marker[] | null = agentType?.startsWith("exam") 
                    ? tryExtractMarkers(fullText) 
                    : null;

                  const processingMs = Math.round(performance.now() - startedAt);
                  const labReportError = agentType?.startsWith("exam") ? tryExtractLabReportError(fullText) : null;
                  
                  const structured = labReportError
                    ? { not_a_lab_report_error: labReportError, processing_ms: processingMs }
                    : (markers
                        ? { markers, processing_ms: processingMs }
                        : { processing_ms: processingMs });

                  // Save final assistant message
                  const { data: assistantInserted } = await (supabase as any)
                    .from("chat_messages")
                    .insert({
                      chat_id: chatId,
                      created_by: user.id,
                      role: "assistant",
                      content: fullText,
                      agent_type: agentType,
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

                  // Salva contexto após resposta do agente de exame
                  if (agentType?.startsWith("exam") && fullText.trim() && !labReportError) {
                    const safeMarkers = markers ?? [];
                    const newCtx: ExamContext = {
                      patient_name: metaRef.current.patient_name,
                      patient_profile: metaRef.current.patient_profile,
                      patient_sex: metaRef.current.patient_sex,
                      gestante_tipo: metaRef.current.gestante_tipo,
                      gestante_periodo: metaRef.current.gestante_periodo,
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
                      resumo_texto: fullText.slice(0, 4000),
                      agent_type: agentType,
                    };
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
  }, [chatId, patientId, readOnly, agentType, examContext, getCost, consume, refetchCredits]);

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
    setMessages([]);
    setError(null);
    setAgentType("exam");
    setExamContext(null);
    setChatId(created.id as string);
  }, [patientId, readOnly]);

  const switchAgent = useCallback((next: string) => {
    setAgentType((prev) => {
      if (prev === next) return prev;
      
      // Ao trocar de agente, queremos manter o contexto da conversa NO MESMO CHAT do Supabase,
      // mas resetar o conversation_id do Dify para que o novo agente comece do zero.
      // IMPORTANTE: IDs de conversa do Dify são vinculados à API Key (App). Como cada agente
      // possui sua própria chave, usar o ID de um agente anterior causará erro no Dify.
      
      conversationIdRef.current = null;
      
      if (chatId) {
        (supabase as any)
          .from("patient_chats")
          .update({ dify_conversation_id: null })
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

  return { chatId, messages, thinking, thinkingMode, error, uploadProgress, removeUploadItem, sendMessage, resetChat, setContext, agentType, setAgentType: switchAgent, examContext };
}
