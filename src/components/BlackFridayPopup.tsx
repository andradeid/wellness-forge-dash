import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  BLACK_FRIDAY_IMAGE,
  BLACK_FRIDAY_URL,
  boughtBlackFriday,
  campaignActive,
  hasLongAccess,
  neverShow,
  setNeverShow,
} from "@/lib/black-friday-popup";

/**
 * Popup da Black Friday ("A Nova Nutricionista") em tela escura, antes do
 * aviso de treinamento. Abre em todo acesso, como o treinamento, até a
 * nutricionista marcar "Não mostrar novamente". Chama onDone quando fecha — ou na hora, se não
 * for exibido — para o próximo aviso abrir.
 */
export function BlackFridayPopup({ onDone }: { onDone: () => void }) {
  const { user, role, loading } = useAuth();
  const [open, setOpen] = useState(false);
  const [hideForever, setHideForever] = useState(false);
  const decidedRef = useRef(false);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    if (loading || decidedRef.current) return;
    if (!user) return;
    decidedRef.current = true;

    // ?preview_black=1 abre a campanha para conferência (qualquer perfil).
    const preview =
      typeof window !== "undefined" && new URLSearchParams(window.location.search).get("preview_black") === "1";
    if (preview) {
      setOpen(true);
      return;
    }
    if (role !== "nutri" || !campaignActive() || neverShow()) {
      doneRef.current();
      return;
    }
    (async () => {
      let bought = false;
      try {
        const { data: sub } = await (supabase as any)
          .from("subscriptions")
          .select("current_period_end")
          .eq("user_id", user.id)
          .maybeSingle();
        if (hasLongAccess(sub?.current_period_end)) bought = true;
      } catch {
        /* segue para o histórico */
      }
      if (!bought) try {
        const { data } = await (supabase as any)
          .from("payment_history")
          .select("metadata, status")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(50);
        bought = boughtBlackFriday((data ?? []) as any[]);
      } catch {
        /* sem histórico: mostra a campanha */
      }
      if (bought) {
        doneRef.current();
        return;
      }
      setOpen(true);
    })();
  }, [loading, user, role]);

  const close = () => {
    setOpen(false);
    doneRef.current();
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 p-4 animate-in fade-in duration-300"
      role="dialog"
      aria-modal="true"
      aria-label="A Nova Nutricionista – Black Friday"
      onClick={close}
    >
      <div className="relative w-full max-w-[min(92vw,560px)]" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={close}
          aria-label="Fechar"
          className="absolute -right-2 -top-2 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white text-black shadow-lg transition hover:scale-105 sm:-right-4 sm:-top-4"
        >
          <X className="h-5 w-5" />
        </button>
        <a
          href={BLACK_FRIDAY_URL}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => {
            setOpen(false);
            doneRef.current();
          }}
          className="block overflow-hidden rounded-2xl shadow-2xl ring-1 ring-white/10"
        >
          <img
            src={BLACK_FRIDAY_IMAGE}
            alt="A Nova Nutricionista – Black Friday: 12x de R$ 196,15 ou R$ 1.897 à vista, mais de 30 cursos e formações, 2 anos de acesso, incluindo a Lumma"
            className="block h-auto w-full max-h-[85vh] object-contain"
          />
        </a>
        <div className="mt-3 flex items-center justify-center gap-6 text-sm text-white/70">
          <label className="flex cursor-pointer items-center gap-2 hover:text-white">
            <input
              type="checkbox"
              className="h-4 w-4 accent-white"
              checked={hideForever}
              onChange={(e) => {
                setHideForever(e.target.checked);
                setNeverShow(e.target.checked);
              }}
            />
            Não mostrar novamente
          </label>
          <button
            type="button"
            onClick={close}
            className="underline-offset-4 hover:text-white hover:underline"
          >
            Agora não
          </button>
        </div>
      </div>
    </div>
  );
}
