import { Coins } from "lucide-react";
import { useMyCredits } from "@/hooks/useCredits";
import { cn } from "@/lib/utils";

interface Props {
  collapsed?: boolean;
  className?: string;
}

export function CreditsBadge({ collapsed, className }: Props) {
  const { data, isLoading } = useMyCredits();
  const balance = data?.balance ?? 0;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium",
        "bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] text-white shadow-sm",
        collapsed && "px-2 py-1",
        className,
      )}
      title={`${balance} créditos disponíveis`}
    >
      <Coins className="h-3.5 w-3.5 shrink-0" />
      {!collapsed && (
        <span className="tabular-nums">
          {isLoading ? "…" : `${balance} créditos`}
        </span>
      )}
    </div>
  );
}
