import { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

type Props = {
  chatId: string | null | undefined;
  onNewChat: () => void;
  /** Limite em horas para considerar a conversa inativa. Default: 24h. */
  thresholdHours?: number;
};

/**
 * Banner que avisa quando a conversa está inativa há mais de N horas.
 * Não rotaciona `conversation_id` automaticamente — apenas sugere ao nutri
 * iniciar uma nova conversa, preservando o contexto clínico da atual.
 */
export function InactiveChatBanner({ chatId, onNewChat, thresholdHours = 24 }: Props) {
  const [lastAt, setLastAt] = useState<Date | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setDismissed(false);
    setLastAt(null);
    if (!chatId) return;
    let cancelled = false;
    (async () => {
      const { data } = await (supabase as any)
        .from("chat_messages")
        .select("created_at")
        .eq("chat_id", chatId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      const ts = (data as { created_at?: string } | null)?.created_at;
      if (ts) setLastAt(new Date(ts));
    })();
    return () => {
      cancelled = true;
    };
  }, [chatId]);

  if (!chatId || dismissed || !lastAt) return null;

  const diffMs = Date.now() - lastAt.getTime();
  const diffH = diffMs / 36e5;
  if (diffH < thresholdHours) return null;

  const label =
    diffH >= 48
      ? `${Math.floor(diffH / 24)} dias`
      : diffH >= 24
      ? "mais de 24 horas"
      : `${Math.floor(diffH)} horas`;

  return (
    <div className="mx-auto mt-3 w-full max-w-3xl px-3 sm:px-0">
      <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3 shadow-sm animate-in fade-in slide-in-from-top-1">
        <div className="shrink-0 h-8 w-8 rounded-lg bg-amber-100 flex items-center justify-center">
          <AlertTriangle className="h-4 w-4 text-amber-700" />
        </div>
        <div className="flex-1 min-w-0 text-sm">
          <p className="font-semibold text-amber-900">
            Esta conversa está inativa há {label}.
          </p>
          <p className="text-amber-800/90 mt-0.5">
            Conversas muito longas ou paradas podem fazer a Lumma responder de forma incompleta.
            Se notar respostas vazias ou fora de contexto, considere iniciar uma nova conversa —
            o histórico atual continuará salvo.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              onClick={onNewChat}
              className="h-8 rounded-full bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] text-white hover:opacity-90"
            >
              Iniciar nova conversa
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setDismissed(true)}
              className="h-8 rounded-full text-amber-900 hover:bg-amber-100"
            >
              Continuar mesmo assim
            </Button>
          </div>
        </div>
        <button
          type="button"
          aria-label="Fechar aviso"
          onClick={() => setDismissed(true)}
          className="shrink-0 text-amber-700/70 hover:text-amber-900"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
