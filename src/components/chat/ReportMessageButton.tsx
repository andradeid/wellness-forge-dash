import { useState } from "react";
import { Flag } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  CurationRequestForm,
  type CurationContext,
} from "@/components/curadoria/CurationRequestForm";

/**
 * Botão "Reportar" exibido apenas para curadores/super admins ao lado das ações
 * já existentes da mensagem. Não interfere no fluxo do chat.
 */
export function ReportMessageButton({ context }: { context: CurationContext }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Reportar esta resposta para curadoria"
        title="Reportar para curadoria"
        className="inline-flex items-center gap-1 sm:gap-1.5 text-xs px-1.5 sm:px-2 py-1 rounded-md text-muted-foreground transition-colors hover:bg-black/5"
      >
        <Flag className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Reportar</span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Reportar para curadoria</DialogTitle>
            <DialogDescription>
              O contexto desta resposta é anexado automaticamente à solicitação.
            </DialogDescription>
          </DialogHeader>
          {open && (
            <CurationRequestForm
              context={context}
              idPrefix={`curation-report-${context.message_id ?? "msg"}`}
              submitLabel="Enviar report"
              onSuccess={() => setOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
