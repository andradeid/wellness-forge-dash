import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { History, MessageSquare, Check } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ChatRow {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
  message_count: number;
  last_message_at: string | null;
}

interface Props {
  patientId: string;
  currentChatId: string | null;
  readOnly?: boolean;
}

export function PatientChatHistory({ patientId, currentChatId, readOnly }: Props) {
  const navigate = useNavigate();
  const [chats, setChats] = useState<ChatRow[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      let q = (supabase as any)
        .from("patient_chats")
        .select("id, title, created_at, updated_at")
        .eq("patient_id", patientId)
        .order("created_at", { ascending: false });
      if (!readOnly) q = q.eq("created_by", user.id);
      const { data: chatList } = await q;
      const list = (chatList as Array<{ id: string; title: string | null; created_at: string; updated_at: string }>) ?? [];
      if (list.length === 0) { if (!cancelled) setChats([]); return; }

      const { data: msgs } = await (supabase as any)
        .from("chat_messages")
        .select("chat_id, created_at")
        .in("chat_id", list.map((c) => c.id))
        .order("created_at", { ascending: false });
      const msgList = (msgs as Array<{ chat_id: string; created_at: string }> | null) ?? [];
      const counts = new Map<string, { count: number; last: string }>();
      for (const m of msgList) {
        const cur = counts.get(m.chat_id);
        if (cur) cur.count += 1;
        else counts.set(m.chat_id, { count: 1, last: m.created_at });
      }
      if (!cancelled) {
        setChats(list.map((c) => ({
          ...c,
          message_count: counts.get(c.id)?.count ?? 0,
          last_message_at: counts.get(c.id)?.last ?? null,
        })));
      }
    })();
    return () => { cancelled = true; };
  }, [open, patientId, readOnly, currentChatId]);

  const openChat = (id: string) => {
    if (id === currentChatId) { setOpen(false); return; }
    navigate({ to: "/app/chat/$patientId", params: { patientId }, search: { chatId: id } });
    setOpen(false);
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className="rounded-full gap-2 h-10 sm:h-9 px-3"
          title="Ver todas as conversas deste paciente"
        >
          <History className="h-4 w-4" />
          <span className="hidden sm:inline">Conversas</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-h-[70vh] overflow-y-auto">
        <DropdownMenuLabel className="text-xs uppercase tracking-wider text-muted-foreground">
          Histórico de conversas
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {chats.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-muted-foreground">
            Nenhuma conversa anterior.
          </div>
        ) : (
          chats.map((c) => {
            const isCurrent = c.id === currentChatId;
            const ref = c.last_message_at ?? c.created_at;
            return (
              <DropdownMenuItem
                key={c.id}
                onClick={() => openChat(c.id)}
                className="flex flex-col items-start gap-1 py-2.5 cursor-pointer"
              >
                <div className="flex w-full items-center gap-2">
                  <MessageSquare className="h-3.5 w-3.5 shrink-0 text-[#e8a04c]" />
                  <span className="text-sm font-medium truncate flex-1">
                    {c.title?.trim() || `Conversa de ${format(new Date(c.created_at), "dd/MM/yyyy", { locale: ptBR })}`}
                  </span>
                  {isCurrent && <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" />}
                </div>
                <div className="text-[11px] text-muted-foreground pl-5">
                  {c.message_count} {c.message_count === 1 ? "mensagem" : "mensagens"}
                  {" · "}
                  {format(new Date(ref), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                </div>
              </DropdownMenuItem>
            );
          })
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
