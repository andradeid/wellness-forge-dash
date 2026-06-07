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
  const researchSavedRef = useRef<boolean>(false);
  const researchSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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
    return () => {
      if (researchSaveTimeoutRef.current) {
        clearTimeout(researchSaveTimeoutRef.current);
      }
    };
  }, [chatId]);

  const sendMessage = useCallback(async (text: string) => {
    if (!chatId || !user) return;
    
    setThinking(true);
    setStreamingContent("");
    researchSavedRef.current = false;
    
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
      const assistantId = crypto.randomUUID();

      const saveMessageToSupabase = async (content: string, convId?: string) => {
        if (!content.trim()) return;
        
        const isUpdate = researchSavedRef.current;
        
        if (convId) {
          conversationIdRef.current = convId;
          await supabase
            .from("general_chats")
            .update({ dify_conversation_id: convId })
            .eq("id", chatId);
        }

        let result;
        if (isUpdate) {
          const lastAssistantMsg = [...messages].reverse().find(m => m.role === 'assistant' && m.agent_type === 'research');
          const updateId = lastAssistantMsg?.id;
          
          if (updateId && !updateId.includes('-')) {
            result = await supabase
              .from("general_chat_messages")
              .update({ content: content })
              .eq("id", updateId)
              .select("id")
              .single();
          } else {
            result = await supabase.from("general_chat_messages").insert([
              { chat_id: chatId, role: "user", content: text, agent_type: agentType },
              { chat_id: chatId, role: "assistant", content: content, agent_type: agentType }
            ]).select("id").single();
          }
        } else {
          result = await supabase.from("general_chat_messages").insert([
            { chat_id: chatId, role: "user", content: text, agent_type: agentType },
            { chat_id: chatId, role: "assistant", content: content, agent_type: agentType }
          ]).select("id").single();
        }

        researchSavedRef.current = true;
        
        // AJUSTE: Se for research e for a primeira mensagem, define o título
        const { data: countData } = await supabase
          .from("general_chat_messages")
          .select("id", { count: 'exact', head: true })
          .eq("chat_id", chatId);
        
        const isFirstMessage = (countData?.length ?? 0) <= 2; 

        if (isFirstMessage && agentType === 'research') {
          const title = text.slice(0, 60);
          await supabase
            .from("general_chats")
            .update({ title })
            .eq("id", chatId);
        }

        await supabase
          .from("general_chats")
          .update({ 
            updated_at: new Date().toISOString(),
            agent_type: agentType 
          })
          .eq("id", chatId);
      };
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
            
            if (parsed.event === "agent_message" || parsed.event === "message" || (agentType === "research" && parsed.event === "agent_thought")) {
              const chunk = parsed.answer ?? parsed.text ?? parsed.content ?? "";
              if (chunk) {
                fullAssistantText += chunk;
                
                // Update the last message (the assistant one) in the state
                setMessages((prev) => {
                  const updated = [...prev];
                  const lastIdx = updated.length - 1;
                  if (updated[lastIdx]?.role === "assistant") {
                    updated[lastIdx] = { ...updated[lastIdx], content: fullAssistantText };
                  }
                  return updated;
                });

                // MUDANÇA 1 e 3: Save por timeout como fallback de emergência
                if (agentType === 'research') {
                  if (researchSaveTimeoutRef.current) {
                    clearTimeout(researchSaveTimeoutRef.current);
                  }
                  
                  researchSaveTimeoutRef.current = setTimeout(async () => {
                    // MUDANÇA 3: Timeout de 8s e mínimo de 500 chars
                    if (fullAssistantText.length > 500 && !researchSavedRef.current) {
                      await saveMessageToSupabase(fullAssistantText, conversationIdRef.current || undefined);
                    }
                  }, 8000);
                }
              }
            }

            if (parsed.event === "message_end") {
              // MUDANÇA 2: Sempre salva no message_end, cancelando o timeout
              if (researchSaveTimeoutRef.current) {
                clearTimeout(researchSaveTimeoutRef.current);
                researchSaveTimeoutRef.current = null;
              }
              await saveMessageToSupabase(fullAssistantText, parsed.conversation_id);
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
