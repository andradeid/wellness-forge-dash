import { CalendarX2, Coins } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { topUpStore } from "@/lib/topup-store";

interface Props {
  collapsed?: boolean;
  className?: string;
  balance?: number;
  unlimited?: boolean;
  isLoading?: boolean;
  /** Assinatura vencida: consumo suspenso até a renovação. */
  expired?: boolean;
}

export function CreditsBadge({
  collapsed,
  className,
  balance = 0,
  unlimited = false,
  isLoading = false,
  expired = false,
}: Props) {
  const navigate = useNavigate();
  const label = expired ? "Plano vencido" : unlimited ? "Ilimitado" : `${balance} créditos`;
  const title = expired
    ? "Assinatura vencida — clique para renovar"
    : unlimited
      ? "Créditos ilimitados"
      : `${balance} créditos disponíveis — clique para recarregar`;

  return (
    <button
      type="button"
      onClick={() => {
        if (expired) {
          void navigate({ to: "/app/planos" });
          return;
        }
        topUpStore.open();
      }}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium",
        expired
          ? "bg-destructive text-destructive-foreground shadow-sm"
          : "bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] text-white shadow-sm",
        "hover:opacity-90 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e89bcf]",
        collapsed && "px-2 py-1",
        className,
      )}
      title={title}
      aria-label={title}
    >
      {expired ? (
        <CalendarX2 className="h-3.5 w-3.5 shrink-0" />
      ) : (
        <Coins className="h-3.5 w-3.5 shrink-0" />
      )}
      {!collapsed && <span className="tabular-nums">{isLoading ? "…" : label}</span>}
    </button>
  );
}
