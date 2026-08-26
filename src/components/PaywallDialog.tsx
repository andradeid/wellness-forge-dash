import { AlertCircle, CalendarX2, Coins, MessageCircle } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { topUpStore } from "@/lib/topup-store";
import type { PaywallReason } from "@/lib/paywall-store";
import { SUPPORT_WHATSAPP_URL } from "@/lib/support-links";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  needed: number;
  balance: number;
  agentLabel?: string | null;
  reason?: PaywallReason;
  expiredAt?: string | null;
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(d);
}

export function PaywallDialog({
  open,
  onOpenChange,
  needed,
  balance,
  agentLabel,
  reason = "insufficient",
  expiredAt,
}: Props) {
  const navigate = useNavigate();
  const expiredLabel = formatDate(expiredAt);

  if (reason === "expired") {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-r from-[#e8a04c] to-[#e89bcf]">
              <CalendarX2 className="h-6 w-6 text-white" />
            </div>
            <DialogTitle className="text-center">Assinatura vencida</DialogTitle>
            <DialogDescription className="text-center">
              {expiredLabel
                ? <>Sua assinatura venceu em <span className="font-semibold text-foreground">{expiredLabel}</span>. </>
                : <>Sua assinatura está vencida. </>}
              Você continua com acesso para consultar pacientes, conversas e relatórios já
              realizados, mas as análises com os agentes da Lumma ficam suspensas até a renovação.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border bg-muted/30 p-3 flex items-center gap-2 text-sm">
            <MessageCircle className="h-4 w-4 text-[#e8a04c]" />
            <span>Precisa de ajuda com o pagamento? Fale com o suporte.</span>
          </div>
          <DialogFooter className="sm:justify-between">
            <Button variant="outline" asChild>
              <a href={SUPPORT_WHATSAPP_URL} target="_blank" rel="noreferrer">
                Falar com o suporte
              </a>
            </Button>
            <Button
              className="bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] text-white"
              onClick={() => {
                onOpenChange(false);
                void navigate({ to: "/app/planos" });
              }}
            >
              Renovar meu plano
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
            <AlertCircle className="h-6 w-6 text-amber-600" />
          </div>
          <DialogTitle className="text-center">Créditos insuficientes</DialogTitle>
          <DialogDescription className="text-center">
            Esta ação{agentLabel ? ` (${agentLabel})` : ""} consome{" "}
            <span className="font-semibold text-foreground">{needed}</span> créditos,
            mas você tem apenas{" "}
            <span className="font-semibold text-foreground">{balance}</span>.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-lg border bg-muted/30 p-3 flex items-center gap-2 text-sm">
          <Coins className="h-4 w-4 text-amber-600" />
          <span>Deseja adquirir um pacote de recarga agora?</span>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Agora não
          </Button>
          <Button
            className="bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] text-white"
            onClick={() => {
              onOpenChange(false);
              topUpStore.open();
            }}
          >
            Comprar créditos
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
