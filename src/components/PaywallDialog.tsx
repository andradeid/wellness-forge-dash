import { AlertCircle, Coins } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { topUpStore } from "@/lib/topup-store";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  needed: number;
  balance: number;
  agentLabel?: string | null;
}

export function PaywallDialog({ open, onOpenChange, needed, balance, agentLabel }: Props) {
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
