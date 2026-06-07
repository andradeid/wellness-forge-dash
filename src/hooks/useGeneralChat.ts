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
  const researchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const researchSavedRef = useRef<boolean>(false);
  const currentFullTextRef = useRef<string>("");

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
      if (researchTimeoutRef.current) {
        clearTimeout(researchTimeoutRef.current);
      }
    };
  }, [chatId]);

  const sendMessage = useCallback(async (text: string) => {
    if (!chatId || !user) return;
    
    setThinking(true);
    setStreamingContent("");
    researchSavedRef.current = false;
    currentFullTextRef.current = "";
    if (researchTimeoutRef.current) {
      clearTimeout(researchTimeoutRef.current);
      researchTimeoutRef.current = null;
    }
    
    
    const userMsgId = crypto.randomUUID();
    const userMsg: ChatMessage = {
      id: userMsgId,
      role: "user",
      content: text,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);

    // Save user message immediately to ensure it's in history even if streaming fails
    const { data: userInserted } = await supabase.from("general_chat_messages").insert([
      { chat_id: chatId, role: "user", content: text, agent_type: agentType }
    ]).select("id").single();

    const assistantId = crypto.randomUUID();
    const saveAssistantToSupabase = async (content: string, convId?: string) => {
      // Only save if we have some content OR if it's the final event
      if (!content.trim() && !convId) return;
      
      if (convId) {
        conversationIdRef.current = convId;
        await supabase
          .from("general_chats")
          .update({ dify_conversation_id: convId })
          .eq("id", chatId);
      }

      // Save assistant message to DB
      const { data: assistantInserted } = await supabase.from("general_chat_messages").insert([
        { chat_id: chatId, role: "assistant", content: content, agent_type: agentType }
      ]).select("id").single();

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

      if (assistantInserted?.id) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, id: assistantInserted.id } : m
          )
        );
      }
    };

    try {
      const { data: { session } } = await supabase.auth.getSession();
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
            
            if (parsed.event === "agent_message" || parsed.event === "message" || parsed.event === "agent_thought") {
              const chunk = parsed.answer ?? parsed.text ?? parsed.content ?? "";
              if (chunk) {
                fullAssistantText += chunk;
                currentFullTextRef.current = fullAssistantText;
                
                // Update the last message (the assistant one) in the state
                setMessages((prev) => {
                  const updated = [...prev];
                  const lastIdx = updated.length - 1;
                  if (updated[lastIdx]?.role === "assistant") {
                    updated[lastIdx] = { ...updated[lastIdx], content: fullAssistantText };
                  }
                  return updated;
                });

                // Lógica de salvamento por timeout para research
                if (agentType === 'research') {
                  if (researchTimeoutRef.current) {
                    clearTimeout(researchTimeoutRef.current);
                  }
                  researchTimeoutRef.current = setTimeout(async () => {
                    if (!researchSavedRef.current && currentFullTextRef.current.length > 200) {
                      researchSavedRef.current = true;
                      await saveAssistantToSupabase(currentFullTextRef.current, parsed.conversation_id);
                    }
                  }, 15000);
                }
              }
            }

            if (parsed.event === "message_end") {
              if (researchTimeoutRef.current) {
                clearTimeout(researchTimeoutRef.current);
                researchTimeoutRef.current = null;
              }
              
              if (agentType === "research") {
                if (!researchSavedRef.current) {
                  researchSavedRef.current = true;
                  await saveAssistantToSupabase(fullAssistantText, parsed.conversation_id);
                }
              } else {
                await saveAssistantToSupabase(fullAssistantText, parsed.conversation_id);
              }
            }

            if (parsed.event === "error") {
              if (researchTimeoutRef.current) {
                clearTimeout(researchTimeoutRef.current);
                researchTimeoutRef.current = null;
              }
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
      if (researchTimeoutRef.current && !researchSavedRef.current && agentType === 'research' && currentFullTextRef.current.length > 200) {
        researchSavedRef.current = true;
        saveAssistantToSupabase(currentFullTextRef.current);
      }
      setThinking(false);
    }
  }, [chatId, user, agentType]);

  return { messages, sendMessage, thinking };
}
