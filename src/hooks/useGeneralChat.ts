import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { ChatMessage } from "@/components/chat/ChatMessageList";
import { toast } from "sonner";

export interface ExamContext {
  patient_name: string;
  patient_profile: string;
  patient_sex: string;
  exam_date: string;
  alteracoes: string[];
  otimos: string[];
  resumo_clinico: string;
}

export function useGeneralChat(chatId: string, agentType: string) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [thinking, setThinking] = useState(false);
  const conversationIdRef = useRef<string>("");

  useEffect(() => {
    if (!chatId) return;
    const loadMessages = async () => {
      const { data } = await supabase
        .from("general_chat_messages")
        .select("id, role, content, created_at")
        .eq("chat_id", chatId)
        .order("created_at", { ascending: true });
      
      setMessages((data as ChatMessage[]) ?? []);
    };
    loadMessages();
  }, [chatId]);

  const sendMessage = useCallback(async (text: string) => {
    if (!chatId || !user) return;
    
    setThinking(true);
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/dify/chat", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: text,
          agent_type: agentType,
          conversation_id: conversationIdRef.current || undefined,
        }),
      });

      if (!res.ok) throw new Error("Falha ao comunicar com agente");
      
      const json = await res.json();
      if (json.conversation_id) conversationIdRef.current = json.conversation_id;

      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: json.answer ?? "",
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMsg]);

      // Save to DB
      await supabase.from("general_chat_messages").insert([
        { chat_id: chatId, role: "user", content: text, agent_type: agentType },
        { chat_id: chatId, role: "assistant", content: assistantMsg.content, agent_type: agentType }
      ]);
      await supabase.from("general_chats").update({ updated_at: new Date().toISOString() }).eq("id", chatId);

    } catch (e) {
      toast.error("Erro na comunicação");
    } finally {
      setThinking(false);
    }
  }, [chatId, user, agentType]);

  return { messages, sendMessage, thinking };
}
