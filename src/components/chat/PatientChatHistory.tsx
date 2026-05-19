import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { History, MessageSquare, Check, Trash2, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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
  const [loading, setLoading] = useState(false);
  const [confirmStep, setConfirmStep] = useState<0 | 1 | 2>(0);
  const [pendingDelete, setPendingDelete] = useState<ChatRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        let q = (supabase as any)
          .from("patient_chats")
          .select("id, title, created_at, updated_at")
          .eq("patient_id", patientId);
        if (!readOnly) q = q.eq("created_by", user.id);
        const { data: chatList } = await q;
        const list = (chatList as Array<{ id: string; title: string | null; created_at: string; updated_at: string }>) ?? [];
        if (list.length === 0) { if (!cancelled) setChats([]); return; }

        // Fetch count + last message per chat (parallel, avoids 1000-row global limit)
        const enriched = await Promise.all(list.map(async (c) => {
          const [{ count }, { data: lastMsg }] = await Promise.all([
            (supabase as any)
              .from("chat_messages")
              .select("id", { count: "exact", head: true })
              .eq("chat_id", c.id),
            (supabase as any)
              .from("chat_messages")
              .select("created_at")
              .eq("chat_id", c.id)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle(),
          ]);
          return {
            ...c,
            message_count: count ?? 0,
            last_message_at: (lastMsg as { created_at: string } | null)?.created_at ?? null,
          } as ChatRow;
        }));

        enriched.sort((a, b) => {
          const da = new Date(a.last_message_at ?? a.created_at).getTime();
          const db = new Date(b.last_message_at ?? b.created_at).getTime();
          return db - da;
        });

        if (!cancelled) setChats(enriched);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, patientId, readOnly, currentChatId, reloadKey]);

  const openChat = (id: string) => {
    if (id === currentChatId) { setOpen(false); return; }
    navigate({ to: "/app/chat/$patientId", params: { patientId }, search: { chatId: id } });
    setOpen(false);
  };

  const askDelete = (c: ChatRow) => {
    setPendingDelete(c);
    setConfirmStep(1);
  };

  const doDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      const { error: mErr } = await (supabase as any)
        .from("chat_messages")
        .delete()
        .eq("chat_id", pendingDelete.id);
      if (mErr) throw mErr;
      const { error: cErr } = await (supabase as any)
        .from("patient_chats")
        .delete()
        .eq("id", pendingDelete.id);
      if (cErr) throw cErr;
      toast.success("Conversa excluída.");
      const wasCurrent = pendingDelete.id === currentChatId;
      setConfirmStep(0);
      setPendingDelete(null);
      setReloadKey((k) => k + 1);
      if (wasCurrent) {
        navigate({ to: "/app/chat/$patientId", params: { patientId }, search: {} });
      }
    } catch (e: any) {
      toast.error("Não foi possível excluir.", { description: e?.message });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
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
        <DropdownMenuContent align="end" className="w-96 max-h-[70vh] overflow-y-auto">
          <DropdownMenuLabel className="text-xs uppercase tracking-wider text-muted-foreground">
            Histórico de conversas
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {loading ? (
            <div className="flex items-center justify-center gap-2 px-3 py-6 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando…
            </div>
          ) : chats.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">
              Nenhuma conversa anterior.
            </div>
          ) : (
            chats.map((c) => {
              const isCurrent = c.id === currentChatId;
              const ref = c.last_message_at ?? c.created_at;
              return (
                <div
                  key={c.id}
                  className="flex items-start gap-2 px-2 py-2 hover:bg-accent rounded-sm group"
                >
                  <button
                    type="button"
                    onClick={() => openChat(c.id)}
                    className="flex-1 flex flex-col items-start gap-1 text-left min-w-0"
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
                  </button>
                  {!readOnly && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive opacity-60 group-hover:opacity-100"
                      onClick={(e) => { e.stopPropagation(); askDelete(c); }}
                      title="Excluir conversa"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              );
            })
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog
        open={confirmStep === 1}
        onOpenChange={(o) => { if (!o) { setConfirmStep(0); setPendingDelete(null); } }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir esta conversa?</AlertDialogTitle>
            <AlertDialogDescription>
              Todas as mensagens de <strong>{pendingDelete?.title?.trim() || "esta conversa"}</strong>{" "}
              ({pendingDelete?.message_count ?? 0} mensagens) serão removidas. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); setConfirmStep(2); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Continuar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={confirmStep === 2}
        onOpenChange={(o) => { if (!o && !deleting) { setConfirmStep(0); setPendingDelete(null); } }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão definitiva</AlertDialogTitle>
            <AlertDialogDescription>
              Confirme novamente para excluir permanentemente a conversa e seu histórico.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); doDelete(); }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-2" /> Excluindo…</> : "Excluir definitivamente"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
