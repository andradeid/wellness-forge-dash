import { Check, Coins, Info, Sparkles } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";

interface Pack {
  id: string;
  name: string;
  credits: number;
  priceBRL: number;
  highlight?: boolean;
  perks: string[];
}

const PACKS: Pack[] = [
  {
    id: "starter",
    name: "Pacote Inicial",
    credits: 50,
    priceBRL: 19.9,
    perks: ["Ideal para testar agentes", "Validade ilimitada"],
  },
  {
    id: "pro",
    name: "Pacote Profissional",
    credits: 200,
    priceBRL: 59.9,
    highlight: true,
    perks: ["Melhor custo-benefício", "Análises de exames recorrentes", "Validade ilimitada"],
  },
  {
    id: "premium",
    name: "Pacote Premium",
    credits: 500,
    priceBRL: 119.9,
    perks: ["Volume alto de atendimentos", "Inclui suporte prioritário", "Validade ilimitada"],
  },
];

// Configurável via env. Fallback de placeholder.
const SUPPORT_WHATSAPP =
  (import.meta.env.VITE_SUPPORT_WHATSAPP as string | undefined) ?? "5511999999999";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function TopUpDialog({ open, onOpenChange }: Props) {
  const { user } = useAuth();
  const identifier = user?.email ?? user?.id ?? "não identificado";

  const buildWhatsAppLink = (pack: Pack) => {
    const message = `Olá, gostaria de recarregar meu saldo do LUMMA 2.\n\n*Pacote escolhido:* ${pack.name}\n*Créditos:* ${pack.credits}\n*Valor:* R$ ${pack.priceBRL.toFixed(2).replace(".", ",")}\n*Usuário:* ${identifier}`;
    return `https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(message)}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-r from-[#e8a04c] to-[#e89bcf]">
            <Coins className="h-6 w-6 text-white" />
          </div>
          <DialogTitle className="text-center text-2xl">Recarregar créditos</DialogTitle>
          <DialogDescription className="text-center">
            Escolha o pacote ideal para o seu volume de atendimentos. Os créditos
            são consumidos conforme o agente utilizado em cada interação.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-3 mt-2">
          {PACKS.map((pack) => (
            <div
              key={pack.id}
              className={cn(
                "relative flex flex-col rounded-lg border bg-card p-5 shadow-sm transition",
                pack.highlight
                  ? "border-transparent ring-2 ring-[#e89bcf] shadow-md"
                  : "hover:shadow-md",
              )}
            >
              {pack.highlight && (
                <Badge className="absolute -top-2 right-4 bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] text-white border-0">
                  <Sparkles className="h-3 w-3 mr-1" /> Mais vendido
                </Badge>
              )}
              <h3 className="font-semibold text-base">{pack.name}</h3>
              <div className="mt-3 flex items-baseline gap-1">
                <span
                  className={cn(
                    "text-3xl font-bold tabular-nums",
                    pack.highlight && "bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] bg-clip-text text-transparent",
                  )}
                >
                  {pack.credits}
                </span>
                <span className="text-sm text-muted-foreground">créditos</span>
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                por{" "}
                <span className="font-semibold text-foreground">
                  R$ {pack.priceBRL.toFixed(2).replace(".", ",")}
                </span>
              </div>

              <ul className="mt-4 space-y-2 text-sm text-muted-foreground flex-1">
                {pack.perks.map((perk) => (
                  <li key={perk} className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                    <span>{perk}</span>
                  </li>
                ))}
              </ul>

              <Button
                disabled
                className={cn(
                  "mt-5 rounded-full",
                  pack.highlight
                    ? "bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] text-white hover:opacity-90"
                    : "",
                )}
                variant={pack.highlight ? "default" : "outline"}
              >
                Comprar crédito
              </Button>

            </div>
          ))}
        </div>

        <div className="mt-4 flex items-start gap-2 rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
          <Info className="h-4 w-4 mt-0.5 shrink-0 text-[#e8a04c]" />
          <p>
            Após a confirmação do pagamento, o saldo é liberado em instantes pelo
            administrador. Você será notificado e o novo saldo aparecerá
            automaticamente no topo da tela.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
