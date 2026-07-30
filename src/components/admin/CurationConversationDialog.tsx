import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, MessageSquare } from "lucide-react";
import { getCurationConversation } from "@/lib/curation-admin.functions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface CurationConversationDialogProps {
  requestId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function formatDateTime(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Visualização somente leitura da conversa que originou um report.
 * O acesso é dirigido pelo id do report e auditado no servidor.
 */
export function CurationConversationDialog({
  requestId,
  open,
  onOpenChange,
}: CurationConversationDialogProps) {
  const fetchConversation = useServerFn(getCurationConversation);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["curation-conversation", requestId],
    enabled: open && !!requestId,
    staleTime: 60_000,
    queryFn: () => fetchConversation({ data: { requestId: requestId! } }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Conversa original
          </DialogTitle>
          <DialogDescription>
            Visualização somente leitura para fins de curadoria. Este acesso fica registrado
            na auditoria do sistema.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando conversa...
          </div>
        ) : isError ? (
          <p className="py-8 text-sm text-destructive">
            {error instanceof Error
              ? error.message
              : "Não foi possível carregar a conversa original."}
          </p>
        ) : data ? (
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                <span>
                  <strong className="text-foreground">Origem:</strong>{" "}
                  {data.source === "patient" ? "Chat com paciente" : "Chat geral"}
                </span>
                {data.patient && (
                  <span>
                    <strong className="text-foreground">Paciente:</strong> {data.patient.name}
                  </span>
                )}
                {data.agent_type && (
                  <span>
                    <strong className="text-foreground">Agente:</strong> {data.agent_type}
                  </span>
                )}
                {data.selected_task && (
                  <span>
                    <strong className="text-foreground">Tarefa:</strong> {data.selected_task}
                  </span>
                )}
              </div>
            </div>

            {data.messages.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Esta conversa não possui mensagens.
              </p>
            ) : (
              <div className="space-y-3">
                {data.messages.map((message) => (
                  <div
                    key={message.id}
                    className={cn(
                      "rounded-lg border p-3",
                      message.role === "user" ? "bg-muted/40" : "bg-card",
                      message.is_reported && "border-2 border-[#e8a04c]",
                    )}
                  >
                    <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="secondary">
                        {message.role === "user" ? "Profissional" : "Lumma"}
                      </Badge>
                      <span>{formatDateTime(message.created_at)}</span>
                      {message.is_reported && (
                        <Badge className="bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] text-white">
                          Mensagem reportada
                        </Badge>
                      )}
                    </div>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                      {message.content || "—"}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
