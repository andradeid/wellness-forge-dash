import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface ChatItem {
  id: string;
  title: string;
  updated_at: string;
  patient_id: string | null;
  patient_name: string | null;
  agent_type?: string | null;
  pinned_at: string | null;
  avatar_url?: string | null;
  last_message?: {
    content: string;
    role: string;
    created_at: string;
  } | null;
  message_count?: number;
  exam_count?: number;
}

export function useChatHistory(limit = 50) {
  const { user } = useAuth();
  const [chats, setChats] = useState<ChatItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchChats = async () => {
    if (!user) return;
    setLoading(true);
    
    try {
      const [patientChatsRes, generalChatsRes] = await Promise.all([
        (supabase as any)
          .from("patient_chats")
          .select(`
            id, 
            title, 
            updated_at, 
            patient_id, 
            pinned_at,
            patients:patient_id(id, name, avatar_url),
            chat_messages(content, role, created_at)
          `)
          .eq("created_by", user.id)
          .order("pinned_at", { ascending: false, nullsFirst: false })
          .order("updated_at", { ascending: false })
          .limit(limit),
        supabase
          .from("general_chats")
          .select(`
            id,
            title,
            updated_at,
            agent_type,
            pinned_at,
            general_chat_messages(content, role, created_at)
          `)
          .eq("created_by", user.id)
          .order("updated_at", { ascending: false })
          .limit(limit)
      ]);

      if (patientChatsRes.error) throw patientChatsRes.error;
      if (generalChatsRes.error) throw generalChatsRes.error;

      const pChats = patientChatsRes.data ?? [];
      const gChats = generalChatsRes.data ?? [];

      const chatIds = pChats.map((c: any) => c.id);
      let examsByChat: Record<string, number> = {};

      if (chatIds.length > 0) {
        const { data: examsData } = await (supabase as any)
          .from("patient_exams")
          .select("chat_id")
          .in("chat_id", chatIds);
        
        for (const e of examsData ?? []) {
          examsByChat[e.chat_id] = (examsByChat[e.chat_id] ?? 0) + 1;
        }
      }

      const mappedPChats: ChatItem[] = pChats.map((c: any) => {
        const patient = Array.isArray(c.patients) ? c.patients[0] : c.patients;
        const msgs = Array.isArray(c.chat_messages) ? c.chat_messages : [];
        const sortedMsgs = [...msgs].sort((a: any, b: any) => 
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        const lastMsg = sortedMsgs[0] || null;
        return {
          id: c.id,
          title: c.title || patient?.name || "Conversa sem título",
          updated_at: c.updated_at,
          patient_id: c.patient_id ?? null,
          patient_name: patient?.name ?? null,
          pinned_at: c.pinned_at ?? null,
          avatar_url: patient?.avatar_url ?? null,
          last_message: lastMsg ? {
            content: lastMsg.content,
            role: lastMsg.role,
            created_at: lastMsg.created_at
          } : null,
          message_count: msgs.length,
          exam_count: examsByChat[c.id] ?? 0,
        };
      });

      const mappedGChats: ChatItem[] = gChats.map((c: any) => {
        const msgs = Array.isArray(c.general_chat_messages) ? c.general_chat_messages : [];
        const sortedMsgs = [...msgs].sort((a: any, b: any) => 
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        const lastMsg = sortedMsgs[0] || null;
        const agentType = c.agent_type;
        return {
          id: c.id,
          title: c.title || (agentType === 'research' ? 'Pesquisa Científica' : 'Pergunta Clínica'),
          updated_at: c.updated_at,
          patient_id: null,
          patient_name: c.title || (agentType === 'research' ? 'Pesquisa Científica' : 'Pergunta Clínica'),
          agent_type: agentType,
          pinned_at: c.pinned_at ?? null,
          avatar_url: null, // Será tratado no componente via agent_type
          last_message: lastMsg ? {
            content: lastMsg.content,
            role: lastMsg.role,
            created_at: lastMsg.created_at
          } : null,
          message_count: msgs.length,
          exam_count: 0,
        };
      });

      const combined = [...mappedPChats, ...mappedGChats].sort((a, b) => {
        // Ordenação prioritária: pinned_at DESC, depois updated_at DESC
        if (a.pinned_at && !b.pinned_at) return -1;
        if (!a.pinned_at && b.pinned_at) return 1;
        if (a.pinned_at && b.pinned_at) {
          const pinDiff = new Date(b.pinned_at).getTime() - new Date(a.pinned_at).getTime();
          if (pinDiff !== 0) return pinDiff;
        }
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      }).slice(0, limit);

      setChats(combined);
    } catch (error) {
      console.error("Error fetching chat history:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchChats();
  }, [user, limit]);

  // Refetch quando uma conversa é apagada em qualquer lugar do app.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = () => { fetchChats(); };
    window.addEventListener("lumma:chat-deleted", handler);
    return () => window.removeEventListener("lumma:chat-deleted", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, limit]);

  return { chats, loading, refresh: fetchChats };
}
