import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { ChatMessage } from "@/components/chat/ChatMessageList";
import type { Marker } from "@/components/chat/ExamResultCard";

interface DifyFileRef {
  type: "image" | "document";
  transfer_method: "local_file";
  upload_file_id: string;
}

function tryExtractMarkers(text: string): Marker[] | null {
  // Look for ```json blocks containing { "markers": [...] }
  const blockRe = /```(?:json)?\s*([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(text))) {
    try {
      const parsed = JSON.parse(m[1].trim());
      if (Array.isArray(parsed?.markers)) return parsed.markers as Marker[];
    } catch { /* ignore */ }
  }
  // Fallback: any { "markers": [...] } substring
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
  return null;
}

export function useDifyChat(patientId: string) {
  const [chatId, setChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const conversationIdRef = useRef<string>("");

  // Load or create chat for this patient
  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: existing } = await (supabase as any)
        .from("patient_chats")
        .select("id, dify_conversation_id")
        .eq("patient_id", patientId)
        .eq("created_by", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      let id = existing?.id as string | undefined;
      if (!id) {
        const { data: created, error: cErr } = await (supabase as any)
          .from("patient_chats")
          .insert({ patient_id: patientId, created_by: user.id })
          .select("id, dify_conversation_id")
          .single();
        if (cErr) { setError(cErr.message); return; }
        id = created.id;
      } else {
        conversationIdRef.current = existing.dify_conversation_id ?? "";
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
  }, [patientId]);

  const sendMessage = useCallback(async (text: string, files: File[]) => {
    if (!chatId) return;
    setError(null);
    setThinking(true);

    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    const { data: { user } } = await supabase.auth.getUser();
    if (!token || !user) { setThinking(false); return; }

    // 1) Upload files to Dify + storage
    const difyFiles: DifyFileRef[] = [];
    const attachments: Array<{ name: string }> = [];
    for (const file of files) {
      // Storage
      const path = `${user.id}/${patientId}/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("exams").upload(path, file);
      if (upErr) { setError(upErr.message); setThinking(false); return; }

      // Dify
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/dify/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (!res.ok) {
        setError(`Falha ao enviar exame ao Dify (${res.status})`);
        setThinking(false);
        return;
      }
      const json = await res.json() as { id?: string; mime_type?: string };
      const difyId = json.id;

      await (supabase as any).from("patient_exams").insert({
        patient_id: patientId,
        chat_id: chatId,
        uploaded_by: user.id,
        file_path: path,
        file_name: file.name,
        mime_type: file.type,
        size_bytes: file.size,
        dify_file_id: difyId,
      });

      if (difyId) {
        difyFiles.push({
          type: file.type.startsWith("image/") ? "image" : "document",
          transfer_method: "local_file",
          upload_file_id: difyId,
        });
      }
      attachments.push({ name: file.name });
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
    };

    // 3) Placeholder assistant message
    const assistantId = crypto.randomUUID();
    setMessages((prev) => [...prev, userMsg, { id: assistantId, role: "assistant", content: "" }]);

    // 4) Stream from Dify proxy
    let assistantText = "";
    try {
      const res = await fetch("/api/dify/chat", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: text || "Analise o exame anexado.",
          conversation_id: conversationIdRef.current || undefined,
          files: difyFiles,
        }),
      });
      if (!res.ok || !res.body) {
        throw new Error(`Dify ${res.status}: ${await res.text().catch(() => "")}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const l = line.trim();
          if (!l.startsWith("data:")) continue;
          const payload = l.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          try {
            const evt = JSON.parse(payload);
            if (evt.event === "message" || evt.event === "agent_message") {
              assistantText += evt.answer ?? "";
              setMessages((prev) =>
                prev.map((m) => (m.id === assistantId ? { ...m, content: assistantText } : m))
              );
            } else if (evt.event === "message_end" || evt.event === "agent_thought") {
              if (evt.conversation_id) conversationIdRef.current = evt.conversation_id;
            } else if (evt.event === "error") {
              throw new Error(evt.message ?? "Erro do Dify");
            }
          } catch { /* ignore non-JSON lines */ }
        }
      }
    } catch (e) {
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
    const markers = tryExtractMarkers(assistantText);
    const structured = markers ? { markers } : null;
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
  }, [chatId, patientId]);

  return { chatId, messages, thinking, error, sendMessage };
}
