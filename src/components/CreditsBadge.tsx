import { Coins } from "lucide-react";
import { useMyCredits } from "@/hooks/useCredits";
import { cn } from "@/lib/utils";
import { topUpStore } from "@/lib/topup-store";

interface Props {
  collapsed?: boolean;
  className?: string;
}

export function CreditsBadge({ collapsed, className }: Props) {
  const { data, isLoading } = useMyCredits();
  const balance = data?.balance ?? 0;

  return (
    <button
      type="button"
      onClick={() => topUpStore.open()}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium",
        "bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] text-white shadow-sm",
        "hover:opacity-90 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e89bcf]",
        collapsed && "px-2 py-1",
        className,
      )}
      title={`${balance} créditos disponíveis — clique para recarregar`}
      aria-label={`Saldo: ${balance} créditos. Clique para recarregar.`}
    >
      <Coins className="h-3.5 w-3.5 shrink-0" />
      {!collapsed && (
        <span className="tabular-nums">
          {isLoading ? "…" : `${balance} créditos`}
        </span>
      )}
    </button>
  );
}

