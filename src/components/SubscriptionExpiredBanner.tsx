import { CalendarX2 } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useMyCredits } from "@/hooks/useCredits";
import { useAuth } from "@/hooks/useAuth";
import { SUPPORT_WHATSAPP_URL } from "@/lib/support-links";

/**
 * Faixa fixa exibida enquanto a assinatura estiver vencida.
 * O acesso de leitura continua liberado; apenas o consumo de agentes é suspenso.
 */
export function SubscriptionExpiredBanner() {
  const { role } = useAuth();
  const { data } = useMyCredits();

  if (role === "super_admin" || role === "admin" || role === "support" || role === "curator") {
    return null;
  }
  if (!data || (data as any).subscriptionActive !== false) return null;

  const iso = (data as any).currentPeriodEnd as string | null;
  const parsed = iso ? new Date(iso) : null;
  const label =
    parsed && !Number.isNaN(parsed.getTime())
      ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(parsed)
      : null;

  return (
    <div className="w-full bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] px-4 py-2 text-white">
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-2 text-center text-sm sm:flex-row sm:justify-center sm:text-left">
        <CalendarX2 className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          {label ? `Sua assinatura venceu em ${label}.` : "Sua assinatura está vencida."}{" "}
          As análises com os agentes estão suspensas — seu histórico continua disponível.
        </span>
        <span className="flex items-center gap-3">
          <Link
            to="/app/planos"
            className="rounded-full bg-white/20 px-3 py-1 font-medium underline-offset-2 hover:bg-white/30"
          >
            Renovar plano
          </Link>
          <a
            href={SUPPORT_WHATSAPP_URL}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2 hover:opacity-90"
          >
            Suporte
          </a>
        </span>
      </div>
    </div>
  );
}
