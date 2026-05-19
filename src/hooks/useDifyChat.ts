import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { ChatMessage } from "@/components/chat/ChatMessageList";
import type { AttachmentProgressItem, AttachmentProgressStage } from "@/components/chat/ChatInput";
import type { Marker } from "@/components/chat/ExamResultCard";
import {
  processAndPersistMarkers,
  logStructuredAudit,
  type RawMarker,
} from "@/lib/exam-markers";

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

function tryExtractMarkers(text: string): Marker[] | null {
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
  options?: { readOnly?: boolean; forceChatId?: string | null },
) {
  const readOnly = options?.readOnly ?? false;
  const forceChatId = options?.forceChatId ?? null;
  const [chatId, setChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [thinking, setThinking] = useState(false);
  const [thinkingMode, setThinkingMode] = useState<"analysis" | "simple">("analysis");
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<AttachmentProgressItem[]>([]);
  const conversationIdRef = useRef<string>("");
  const metaRef = useRef<{
    nutritionist_name: string;
    nutritionist_email: string;
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
      let chosenChat: { id: string; dify_conversation_id: string | null } | null = null;

      if (forceChatId) {
        const { data } = await (supabase as any)
          .from("patient_chats")
          .select("id, dify_conversation_id, created_by")
          .eq("patient_id", patientId)
          .eq("id", forceChatId)
          .maybeSingle();
        if (data) chosenChat = { id: data.id, dify_conversation_id: data.dify_conversation_id };
      } else {
        let listQuery = (supabase as any)
          .from("patient_chats")
          .select("id, dify_conversation_id, created_by, created_at")
          .eq("patient_id", patientId)
          .order("created_at", { ascending: false });
        if (!readOnly) listQuery = listQuery.eq("created_by", user.id);
        const { data: chats } = await listQuery;
        const list = (chats as Array<{ id: string; dify_conversation_id: string | null }>) ?? [];
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
          .select("full_name, email")
          .eq("id", user.id)
          .maybeSingle(),
        (supabase as any)
          .from("patients")
          .select("name")
          .eq("id", patientId)
          .maybeSingle(),
      ]);

      metaRef.current = {
        ...metaRef.current,
        nutritionist_name: (profile?.full_name as string) || (profile?.email as string) || "Nutricionista",
        nutritionist_email: (profile?.email as string) || "",
        patient_name: (patient?.name as string) || "Paciente",
        patient_id: patientId,
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
      }
      if (cancelled || !id) return;
      setChatId(id);

      const { data: msgs } = await (supabase as any)
        .from("chat_messages")
        .select("id, role, content, structured_data, attachments, created_at")
        .eq("chat_id", id)
        .order("created_at", { ascending: true });
      if (!cancelled) setMessages((msgs as ChatMessage[]) ?? []);
    };
    init();
    return () => { cancelled = true; };
  }, [patientId, readOnly, forceChatId]);

  const sendMessage = useCallback(async (text: string, files: File[]) => {
    if (!chatId || readOnly) return;
    setError(null);
    setThinking(true);
    setThinkingMode(files.length > 0 ? "analysis" : "simple");
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
      attachments: attachments.length ? attachments : null,
    };
    const { data: userInserted } = await (supabase as any)
      .from("chat_messages").insert(userMsgPayload).select("id").single();
    const userMsg: ChatMessage = {
      id: userInserted?.id ?? crypto.randomUUID(),
      role: "user",
      content: text,
      attachments: attachments.length ? attachments : null,
      created_at: new Date().toISOString(),
    };

    // 3) Placeholder assistant message
    const assistantId = crypto.randomUUID();
    setMessages((prev) => [...prev, userMsg, { id: assistantId, role: "assistant", content: "", created_at: new Date().toISOString() }]);

    // 4) Stream from Dify proxy
    let assistantText = "";
    const callDify = async (convId: string | undefined) =>
      fetch("/api/dify/chat", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: text || "Analise o exame anexado.",
          conversation_id: convId,
          files: difyFiles,
          meta: metaRef.current,
        }),
      });

    try {
      // Em conversas antigas, o Dify pode ter salvo o conversation_id com outro `user`.
      // Ao anexar exame, abrimos uma nova conversa Dify com o UUID correto e mantemos o contexto via meta.
      const initialConv = difyFiles.length ? undefined : conversationIdRef.current || undefined;
      let res = await callDify(initialConv);

      // Se o Dify rejeitar o conversation_id (404 / "Conversation Not Exists"),
      // limpamos a referência e abrimos uma nova conversa automaticamente.
      if (!res.ok && initialConv) {
        const errText = await res.text().catch(() => "");
        const stale =
          res.status === 404 ||
          /Conversation Not Exists|not_found/i.test(errText);
        if (stale) {
          console.warn("[Chat Dify] conversation_id descartado (Dify 404). Reabrindo conversa.");
          conversationIdRef.current = "";
          await (supabase as any)
            .from("patient_chats")
            .update({ dify_conversation_id: null })
            .eq("id", chatId);
          res = await callDify(undefined);
        } else {
          throw new Error(`Dify ${res.status}: ${errText}`);
        }
      }

      if (!res.ok || !res.body) {
        throw new Error(`Dify ${res.status}: ${await res.text().catch(() => "")}`);
      }

      console.groupCollapsed("[Chat Dify] Resposta do Dify");
      console.log("Arquivos enviados:", difyFiles);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      const processLine = (line: string) => {
        const l = line.trim();
        if (!l.startsWith("data:")) return;
        const payload = l.slice(5).trim();
        if (!payload || payload === "[DONE]") return;
        try {
          const evt = JSON.parse(payload);
          console.log("Evento recebido:", evt.event, evt);
          if (evt.event === "message" || evt.event === "agent_message") {
            assistantText += getDifyAnswer(evt);
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, content: assistantText } : m))
            );
          } else if (evt.event === "message_end" || evt.event === "agent_thought") {
            if (evt.conversation_id) conversationIdRef.current = evt.conversation_id;
          } else if (evt.event === "error") {
            throw new Error(evt.message ?? "Erro do Dify");
          }
        } catch { /* ignore non-JSON lines */ }
      };
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        lines.forEach(processLine);
      }
      if (buffer.trim()) processLine(buffer);
      console.log("Texto final extraído:", assistantText);
      console.groupEnd();
    } catch (e) {
      console.groupEnd();
      const msg = e instanceof Error ? e.message : "Erro desconhecido";
      setError(msg);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId ? { ...m, content: `⚠️ ${msg}` } : m
        )
      );
      setThinking(false);
      return;
    }

    // 5) Detect structured markers + persist
    if (!assistantText.trim()) {
      const msg = "O Dify recebeu o arquivo, mas não retornou texto de análise. Tente reenviar o exame; os detalhes estão no console.";
      setError(msg);
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantId ? { ...m, content: `⚠️ ${msg}` } : m))
      );
      setThinking(false);
      return;
    }

    const markers = tryExtractMarkers(assistantText);
    let indexed = false;
    let parseError = false;

    if (markers && markers.length) {
      try {
        const result = await processAndPersistMarkers({
          userId: user.id,
          patientId,
          examId: lastExamId,
          chatId,
          rawMarkers: markers as unknown as RawMarker[],
          source: "chat",
        });
        indexed = result.inserted > 0 && result.invalid.length === 0;
        if (result.invalid.length > 0) parseError = true;
      } catch (e) {
        console.error("[Chat] Falha no pipeline de marcadores:", e);
        parseError = true;
      }
    } else if (/```(?:json)?/i.test(assistantText)) {
      // JSON-looking block but couldn't parse → audit it
      parseError = true;
      await logStructuredAudit({
        source: "chat",
        event: "structured_data.parse_failed",
        status: "error",
        message: "Bloco JSON detectado no texto, mas não foi possível extrair marcadores válidos.",
        data: { patient_id: patientId, chat_id: chatId, text_sample: assistantText.slice(0, 2000) },
      });
    }

    const processingMs = Math.round(performance.now() - startedAt);
    const structured = markers
      ? { markers, indexed, parse_error: parseError, processing_ms: processingMs }
      : { ...(parseError ? { parse_error: true } : {}), processing_ms: processingMs };

    setMessages((prev) =>
      prev.map((m) =>
        m.id === assistantId ? { ...m, content: assistantText, structured_data: structured } : m
      )
    );

    await (supabase as any).from("chat_messages").insert({
      chat_id: chatId,
      created_by: user.id,
      role: "assistant",
      content: assistantText,
      structured_data: structured,
    });

    if (conversationIdRef.current) {
      await (supabase as any)
        .from("patient_chats")
        .update({ dify_conversation_id: conversationIdRef.current })
        .eq("id", chatId);
    }

    setThinking(false);
    window.setTimeout(() => setUploadProgress([]), 4000);
  }, [chatId, patientId, readOnly]);

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
    setChatId(created.id as string);
  }, [patientId, readOnly]);

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

  return { chatId, messages, thinking, thinkingMode, error, uploadProgress, sendMessage, resetChat, setContext };
}
