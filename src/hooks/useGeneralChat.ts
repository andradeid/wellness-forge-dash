import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { ChatMessage } from "@/components/chat/ChatMessageList";
import { toast } from "sonner";

export function useGeneralChat(chatId: string, agentType: string) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [thinking, setThinking] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const conversationIdRef = useRef<string>("");

  // Load messages and conversation ID
  useEffect(() => {
    if (!chatId) return;
    const init = async () => {
      // Load chat info (conversation ID)
      const { data: chatData } = await supabase
        .from("general_chats")
        .select("dify_conversation_id")
        .eq("id", chatId)
        .maybeSingle();
      
      if (chatData?.dify_conversation_id) {
        conversationIdRef.current = chatData.dify_conversation_id;
      }

      // Load messages
      const { data: msgData } = await supabase
        .from("general_chat_messages")
        .select("id, role, content, created_at")
        .eq("chat_id", chatId)
        .order("created_at", { ascending: true });
      
      setMessages((msgData as ChatMessage[]) ?? []);
    };
    init();
  }, [chatId]);

  const sendMessage = useCallback(async (text: string) => {
    if (!chatId || !user) return;
    
    setThinking(true);
    setStreamingContent("");
    
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

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || "Falha ao comunicar com agente");
      }

      if (!res.body) throw new Error("Resposta sem corpo");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullAssistantText = "";

      // Add a placeholder message for the assistant that we'll update with streaming content
      const assistantId = crypto.randomUUID();
      setMessages((prev) => [...prev, {
        id: assistantId,
        role: "assistant",
        content: "",
        created_at: new Date().toISOString()
      }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const cleanLine = line.trim();
          if (!cleanLine || !cleanLine.startsWith("data: ")) continue;
          
          const jsonStr = cleanLine.slice(6).trim();
          if (jsonStr === "[DONE]") continue;

          try {
            const parsed = JSON.parse(jsonStr);
            
            if (parsed.event === "agent_message" || parsed.event === "message") {
              const chunk = parsed.answer ?? "";
              fullAssistantText += chunk;
              
              // Update the last message (the assistant one) in the state
              setMessages((prev) => {
                const updated = [...prev];
                const lastIdx = updated.length - 1;
                if (updated[lastIdx].role === "assistant") {
                  updated[lastIdx] = { ...updated[lastIdx], content: fullAssistantText };
                }
                return updated;
              });
            }

            if (parsed.event === "message_end") {
              if (parsed.conversation_id && parsed.conversation_id !== conversationIdRef.current) {
                conversationIdRef.current = parsed.conversation_id;
                // Sync to DB
                await supabase
                  .from("general_chats")
                  .update({ dify_conversation_id: parsed.conversation_id })
                  .eq("id", chatId);
              }

              // AJUSTE 3: Se for research e for a primeira mensagem (não havia mensagens antes da atual), define o título
              if (messages.length === 0 && agentType === 'research') {
                const title = text.slice(0, 60);
                await (supabase as any)
                  .from("general_chats")
                  .update({ title })
                  .eq("id", chatId);
              }

              // Save messages to DB
              await supabase.from("general_chat_messages").insert([
                { chat_id: chatId, role: "user", content: text, agent_type: agentType },
                { chat_id: chatId, role: "assistant", content: fullAssistantText, agent_type: agentType }
              ]);

              await supabase
                .from("general_chats")
                .update({ 
                  updated_at: new Date().toISOString(),
                  agent_type: agentType // Ensure agent_type is persisted
                })
                .eq("id", chatId);
            }

            if (parsed.event === "error") {
              throw new Error(parsed.message || "Erro no Dify");
            }
          } catch (e) {
            // Ignore parse errors for partial lines
          }
        }
      }

    } catch (e: any) {
      console.error("Chat error:", e);
      toast.error(e.message || "Erro na comunicação");
      // Remove the last assistant message if it's empty and there was an error
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant" && !last.content) {
          return prev.slice(0, -1);
        }
        return prev;
      });
    } finally {
      setThinking(false);
    }
  }, [chatId, user, agentType]);

  return { messages, sendMessage, thinking };
}
