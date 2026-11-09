import { useCallback, useEffect, useRef, useState } from "react";
import { taskConsumesFiles } from "@/lib/dify-file-policy";
import { downscaleImageFile } from "@/lib/image-downscale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { ChatMessage } from "@/components/chat/ChatMessageList";
import { toast } from "sonner";
import { useCreditsActions, useMyCredits } from "@/hooks/useCredits";
import { paywallStore } from "@/lib/paywall-store";
import { resolveAgentKey } from "@/lib/agent-key-map";
import { enforceSessionGuard } from "@/lib/session-guard";
import {
  CONCURRENCY_TOAST_DESCRIPTION,
  CONCURRENCY_TOAST_TITLE,
  CONCURRENCY_USER_MESSAGE,
  extractDifyStreamErrorMessage,
  isProviderConcurrencyError,
  isTaskRoutingFallback,
} from "@/lib/dify-error-messages";

/**
 * Perfil escolhido em Perguntas Clínicas → mesmos campos que a conversa com
 * paciente envia ao Dify (curadoria #113: a gestante era tratada como adulta
 * porque o perfil não chegava ao agente).
 */
function profileMeta(profile?: string | null): Record<string, string> | null {
  switch (profile) {
    case "adulto_masculino":
      return { patient_profile: "adulto_masculino", patient_sex: "masculino" };
    case "adulto_feminino":
      return { patient_profile: "adulto_feminino", patient_sex: "feminino" };
    case "gestante_mono":
      return { patient_profile: "gestante", patient_sex: "feminino", gestante_tipo: "Monofetal" };
    case "gestante_gemelar":
      return { patient_profile: "gestante", patient_sex: "feminino", gestante_tipo: "Gemelar" };
    default:
      return null;
  }
}

export function useGeneralChat(
  chatId: string,
  agentType: string,
  selectedTaskKey?: string | null,
  chatProfile?: string | null,
) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [thinking, setThinking] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const conversationIdRef = useRef<string>("");
  const researchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const researchSavedRef = useRef<boolean>(false);
  const currentFullTextRef = useRef<string>("");
  const sendingRef = useRef(false);
  // Botão "Parar" (curadoria #16).
  const streamAbortRef = useRef<AbortController | null>(null);
  const stoppedByUserRef = useRef(false);
  const thinkingRef = useRef(false);
  /** Uma única retentativa automática por envio quando o Dify devolve o fallback de roteamento. */
  const routingRetryUsedRef = useRef(false);
  const sendMessageRef = useRef<((text: string, opts?: { _isRetry?: boolean }) => void) | null>(null);
  useEffect(() => { thinkingRef.current = thinking; }, [thinking]);
  const { getCost, consume } = useCreditsActions();
  const { refetch: refetchCredits } = useMyCredits();

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

  const sendMessage = useCallback(async (text: string, opts?: { _isRetry?: boolean; files?: File[] }) => {
    if (!chatId || !user) return;
    if (sendingRef.current || thinkingRef.current) return;
    if (!opts?._isRetry) routingRetryUsedRef.current = false;
    sendingRef.current = true;
    thinkingRef.current = true;
    stoppedByUserRef.current = false;
    streamAbortRef.current = new AbortController();
    setThinking(true);

    const abortSend = () => {
      thinkingRef.current = false;
      setThinking(false);
    };

    try {
    // Gate de sessão única: aborta se outro dispositivo assumiu o login
    const sessionOk = await enforceSessionGuard(user.id);
    if (!sessionOk) { abortSend(); return; }


    // Gate de créditos
    // Se for Super Agente (perfil escolhido) + task, resolve o custo pela task.
    const isSuper = !!agentType && agentType.startsWith("super_");
    const billingKey = resolveAgentKey(
      agentType,
      isSuper && selectedTaskKey
        ? { isSuperAgent: true, selectedTask: selectedTaskKey }
        : undefined,
    );
    if (billingKey) {
      try {
        const { cost, label } = await getCost(billingKey);
        if (cost > 0) {
          const fresh = await refetchCredits();
          const balance = fresh.data?.balance ?? 0;
          const unlimited = (fresh.data as any)?.unlimited === true;
          const subActive = (fresh.data as any)?.subscriptionActive !== false;
          if (!subActive) {
            paywallStore.openExpired((fresh.data as any)?.currentPeriodEnd ?? null, label);
            abortSend();
            return;
          }
          if (!unlimited && balance < cost) {
            paywallStore.open(cost, balance, label);
            abortSend();
            return;
          }
        }

      } catch (e) {
        console.warn("[credits] pré-check falhou:", e);
      }
    }

    setStreamingContent("");
    researchSavedRef.current = false;
    currentFullTextRef.current = "";
    if (researchTimeoutRef.current) {
      clearTimeout(researchTimeoutRef.current);
      researchTimeoutRef.current = null;
    }
    
    // Anexos (curadoria #43/#65): antes a conversa geral descartava o arquivo
    // em silêncio. Agora sobe para o Dify quando a tarefa lê anexos
    // (Pesquisa Científica e tarefas de exame em Perguntas Clínicas).
    const pendingFiles = (opts?.files ?? []).filter(Boolean);
    const difyFiles: Array<{ type: "image" | "document"; transfer_method: "local_file"; upload_file_id: string }> = [];
    if (pendingFiles.length > 0) {
      const consumer = isSuper && selectedTaskKey ? selectedTaskKey : agentType;
      if (!taskConsumesFiles(consumer)) {
        toast.warning("Esta tarefa não lê arquivos anexados.", {
          description: "Escolha Pesquisa Científica ou uma tarefa de exame para enviar o arquivo.",
          duration: 7000,
        });
        abortSend();
        return;
      }
      const { data: { session: upSession } } = await supabase.auth.getSession();
      for (const original of pendingFiles) {
        const toastId = `gupload-${original.name}-${Date.now()}`;
        toast.loading(`Enviando ${original.name}...`, { id: toastId });
        let file = original;
        if (file.type.startsWith("image/")) {
          try { file = (await downscaleImageFile(file)).file; } catch { /* segue com o original */ }
        }
        const fd = new FormData();
        fd.append("file", file);
        fd.append("agent_type", agentType);
        if (isSuper && selectedTaskKey) fd.append("selected_task", selectedTaskKey);
        const res = await fetch("/api/dify/upload", {
          method: "POST",
          headers: { Authorization: `Bearer ${upSession?.access_token}` },
          body: fd,
        }).catch(() => null);
        const json = res && res.ok ? ((await res.json().catch(() => ({}))) as { id?: string }) : {};
        if (!json.id) {
          const tooBig = res?.status === 413;
          toast.error(tooBig ? `${original.name} é grande demais para análise.` : `Não consegui enviar ${original.name}.`, {
            id: toastId,
            description: tooBig ? "Envie um arquivo menor." : "Tente de novo em alguns instantes.",
            duration: 8000,
          });
          abortSend();
          return;
        }
        toast.success(`${original.name} enviado`, { id: toastId, duration: 2500 });
        difyFiles.push({
          type: file.type.startsWith("image/") ? "image" : "document",
          transfer_method: "local_file",
          upload_file_id: json.id,
        });
      }
    }
    const attachNote = pendingFiles.length
      ? pendingFiles.map((f) => `📎 ${f.name}`).join("\n") + (text.trim() ? "\n\n" : "")
      : "";
    const displayText = attachNote + text;

    const userMsgId = crypto.randomUUID();
    const userMsg: ChatMessage = {
      id: userMsgId,
      role: "user",
      content: displayText,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);

    // Save user message immediately to ensure it's in history even if streaming fails
    const { data: userInserted } = await supabase.from("general_chat_messages").insert([
      { chat_id: chatId, role: "user", content: displayText, agent_type: agentType }
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
      } else if (isFirstMessage && agentType === 'reasoning') {
        // Perguntas Clínicas: primeiros 15 caracteres da primeira mensagem
        const title = text.slice(0, 15);
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
      const res = await fetch("/api/dify/chat", {
        method: "POST",
        signal: streamAbortRef.current?.signal,
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: text.trim() || (difyFiles.length ? "Analise o arquivo anexado." : text),
          agent_type: agentType,
          ...(difyFiles.length ? { files: difyFiles, file_meta: pendingFiles.map((f) => ({ name: f.name, type: f.type })) } : {}),
          conversation_id: conversationIdRef.current || undefined,
          ...(isSuper && selectedTaskKey ? { selected_task: selectedTaskKey } : {}),
          ...(profileMeta(chatProfile) ? { meta: { ...profileMeta(chatProfile), chat_id: chatId } } : {}),
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        if (res.status === 429) {
          let msg = "Aguarde a análise atual terminar antes de enviar outra.";
          try {
            const parsed = JSON.parse(errorText);
            if (parsed?.error) msg = parsed.error;
          } catch { /* corpo não-JSON */ }
          toast.warning(msg, { duration: 6000 });
          return;
        }
        if (isProviderConcurrencyError(errorText)) {
          toast.warning(CONCURRENCY_TOAST_TITLE, {
            description: CONCURRENCY_TOAST_DESCRIPTION,
            duration: 10000,
          });
          return;
        }
        throw new Error(errorText || "Falha ao comunicar com agente");
      }


      if (!res.body) throw new Error("Resposta sem corpo");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullAssistantText = "";
      
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
              
              // Fallback de roteamento do Super Agente (task não reconhecida
              // pelo app Dify): não salva, não cobra e reenvia UMA vez.
              if (isTaskRoutingFallback(fullAssistantText) && !routingRetryUsedRef.current) {
                routingRetryUsedRef.current = true;
                researchSavedRef.current = true;
                console.warn("[dify] fallback de roteamento (chat geral)", {
                  agent_type: agentType,
                  selected_task: selectedTaskKey ?? null,
                });
                if (userInserted?.id) {
                  try {
                    await supabase.from("general_chat_messages").delete().eq("id", userInserted.id);
                  } catch { /* duplicata é preferível a perder a mensagem */ }
                }
                setMessages((prev) => prev.filter((m) => m.id !== assistantId && m.id !== userMsgId));
                setStreamingContent("");
                currentFullTextRef.current = "";
                toast.info("Reenviando sua solicitação…", { duration: 4000 });
                setTimeout(() => { sendMessageRef.current?.(text, { _isRetry: true }); }, 400);
                return;
              }

              if (agentType === "research") {
                if (!researchSavedRef.current) {
                  researchSavedRef.current = true;
                  await saveAssistantToSupabase(fullAssistantText, parsed.conversation_id);
                }
              } else {
                await saveAssistantToSupabase(fullAssistantText, parsed.conversation_id);
              }

              // Débito após resposta completa
              if (billingKey && fullAssistantText.trim() && !isTaskRoutingFallback(fullAssistantText)) {
                try {
                  await consume(billingKey, text.slice(0, 200));
                } catch (e) {
                  console.warn("[credits] débito falhou:", e);
                }
              }
            }

            if (parsed.event === "error") {
              if (researchTimeoutRef.current) {
                clearTimeout(researchTimeoutRef.current);
                researchTimeoutRef.current = null;
              }
              const rawErr = extractDifyStreamErrorMessage(parsed);
              if (isProviderConcurrencyError(rawErr)) {
                const contentToSave = fullAssistantText.trim()
                  ? `${fullAssistantText.trim()}\n\n${CONCURRENCY_USER_MESSAGE}`
                  : CONCURRENCY_USER_MESSAGE;
                if (contentToSave && !researchSavedRef.current) {
                  researchSavedRef.current = true;
                  await saveAssistantToSupabase(contentToSave, parsed.conversation_id);
                }
                setMessages((prev) => {
                  const updated = [...prev];
                  const lastIdx = updated.length - 1;
                  if (updated[lastIdx]?.role === "assistant") {
                    updated[lastIdx] = { ...updated[lastIdx], content: contentToSave };
                  }
                  return updated;
                });
                toast.warning(CONCURRENCY_TOAST_TITLE, {
                  description: CONCURRENCY_TOAST_DESCRIPTION,
                  duration: 10000,
                });
                return;
              }
              throw new Error(parsed.message || "Erro no Dify");
            }
          } catch (e) {
            // Ignore parse errors for partial lines
          }
        }
      }

    } catch (e: any) {
      if (stoppedByUserRef.current) {
        // Parada pela nutricionista: guarda o que chegou, sem erro e sem débito.
        const partial = currentFullTextRef.current.trim();
        if (partial) {
          researchSavedRef.current = true;
          const content = partial + "\n\n⏹️ *Resposta interrompida por você.*";
          setMessages((prev) => {
            const updated = [...prev];
            const lastIdx = updated.length - 1;
            if (updated[lastIdx]?.role === "assistant") updated[lastIdx] = { ...updated[lastIdx], content };
            return updated;
          });
          try { await saveAssistantToSupabase(content); } catch { /* best-effort */ }
        } else {
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            return last?.role === "assistant" && !last.content ? prev.slice(0, -1) : prev;
          });
        }
        toast.info("Resposta interrompida. Ela não foi cobrada.", { duration: 5000 });
        return;
      }
      console.error("Chat error:", e);
      const raw = String(e?.message || "");
      if (isProviderConcurrencyError(raw)) {
        toast.warning(CONCURRENCY_TOAST_TITLE, {
          description: CONCURRENCY_TOAST_DESCRIPTION,
          duration: 10000,
        });
      } else {
        toast.error(e.message || "Erro na comunicação");
      }
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
      thinkingRef.current = false;
      setThinking(false);

      // Fallback: se o stream não entregou conteúdo visível, recarrega do banco
      // (o servidor pode ter salvo via safety timer / message_end atrasado).
      try {
        const localLast = currentFullTextRef.current.trim();
        if (!localLast || localLast.length < 20) {
          const attempt = async () => {
            const { data } = await supabase
              .from("general_chat_messages")
              .select("id, role, content, created_at")
              .eq("chat_id", chatId)
              .order("created_at", { ascending: true });
            if (data && data.length) {
              const lastDb = data[data.length - 1] as any;
              if (lastDb?.role === "assistant" && (lastDb.content ?? "").trim().length > 0) {
                setMessages(data as ChatMessage[]);
                return true;
              }
            }
            return false;
          };
          setTimeout(() => { attempt(); }, 3000);
          setTimeout(() => { attempt(); }, 10000);
        }
      } catch (recoverErr) {
        console.warn("[general-chat] fallback reload falhou:", recoverErr);
      }
    }
    } finally {
      sendingRef.current = false;
    }
  }, [chatId, user, agentType, selectedTaskKey, chatProfile, getCost, consume, refetchCredits]);

  useEffect(() => { sendMessageRef.current = sendMessage; }, [sendMessage]);

  const stopGeneration = useCallback(() => {
    if (!streamAbortRef.current) return;
    stoppedByUserRef.current = true;
    try { streamAbortRef.current.abort(); } catch { /* noop */ }
  }, []);

  return { messages, sendMessage, thinking, stopGeneration };
}
