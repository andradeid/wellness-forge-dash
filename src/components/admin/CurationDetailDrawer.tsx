import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ExternalLink, ImageIcon, Loader2, Save, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ATTACHMENT_BUCKET } from "@/components/curadoria/CurationRequestForm";
import { CurationConversationDialog } from "@/components/admin/CurationConversationDialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type CurationStatus =
  | "registrado"
  | "em_analise"
  | "aprovado_ajuste"
  | "classificado_melhoria"
  | "em_desenvolvimento"
  | "concluido";

export const STATUS_LABEL: Record<CurationStatus, string> = {
  registrado: "Registrado",
  em_analise: "Em análise",
  aprovado_ajuste: "Aprovado (ajuste)",
  classificado_melhoria: "Classificado (melhoria)",
  em_desenvolvimento: "Em desenvolvimento",
  concluido: "Concluído",
};

export const STATUS_ORDER: CurationStatus[] = [
  "registrado",
  "em_analise",
  "aprovado_ajuste",
  "classificado_melhoria",
  "em_desenvolvimento",
  "concluido",
];

export interface CurationAdminRow {
  id: string;
  numero_sequencial: number;
  created_at: string;
  title: string;
  description: string;
  status: string;
  agent_key: string | null;
  chat_id: string | null;
  message_id: string | null;
  patient_id: string | null;
  created_by: string;
  curator_classification: string | null;
  curator_dimension: string | null;
  image_url: string | null;
  ai_classification: string | null;
  ai_confidence: number | null;
  ai_confidence_label?: string | null;
  ai_justification: string | null;
  ai_technical_direction: string | null;
  ai_status?: string | null;
  ai_functionality?: string | null;
  ai_baseline_item?: string | null;
  ai_error?: string | null;
  duplicate_of?: string | null;
  curator_agreement?: string | null;
  admin_final_classification: string | null;
  admin_notes: string | null;
}

const TECHNICAL_LABELS: Record<string, string> = {
  camada: "Camada",
  tipo_ajuste: "Tipo de ajuste",
  sugestao: "Sugestão",
  verificar_antes: "Verificar antes",
  ideias_extras: "Ideias extras",
};

/** Renderiza a direção técnica (JSON) de forma legível. Só o super admin vê isto. */
function TechnicalDirection({ value }: { value: string | null }) {
  if (!value) return <p className="text-muted-foreground">Aguardando análise da IA</p>;

  let parsed: Record<string, unknown> | null = null;
  try {
    const candidate = JSON.parse(value);
    if (candidate && typeof candidate === "object") parsed = candidate as Record<string, unknown>;
  } catch {
    parsed = null;
  }

  if (!parsed) return <p className="whitespace-pre-wrap">{value}</p>;

  return (
    <dl className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-1">
      {Object.entries(parsed)
        .filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== "")
        .map(([key, v]) => (
          <div key={key} className="contents">
            <dt className="text-muted-foreground">{TECHNICAL_LABELS[key] ?? key}</dt>
            <dd className="whitespace-pre-wrap">{String(v)}</dd>
          </div>
        ))}
    </dl>
  );
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function AttachmentImage({ path }: { path: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["curation-attachment", path],
    staleTime: 4 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from(ATTACHMENT_BUCKET)
        .createSignedUrl(path, 300);
      if (error) throw error;
      return data.signedUrl;
    },
  });

  if (isLoading) return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
  if (!data)
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <ImageIcon className="h-3.5 w-3.5" /> Não foi possível carregar o anexo.
      </span>
    );

  return (
    <a href={data} target="_blank" rel="noreferrer">
      <img
        src={data}
        alt="Imagem anexada à solicitação de curadoria"
        className="max-h-64 rounded-lg border object-contain transition-opacity hover:opacity-80"
      />
    </a>
  );
}

interface CurationDetailDrawerProps {
  request: CurationAdminRow | null;
  curatorName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CurationDetailDrawer({
  request,
  curatorName,
  open,
  onOpenChange,
}: CurationDetailDrawerProps) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<string>("registrado");
  const [adminNotes, setAdminNotes] = useState("");
  const [finalClassification, setFinalClassification] = useState<string>("");
  const [conversationOpen, setConversationOpen] = useState(false);

  useEffect(() => {
    if (!request) return;
    setStatus(request.status);
    setAdminNotes(request.admin_notes ?? "");
    setFinalClassification(request.admin_final_classification ?? "");
  }, [request]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!request) return;
      const { error } = await (supabase as any)
        .from("curation_requests")
        .update({
          status,
          admin_notes: adminNotes.trim() || null,
          admin_final_classification: finalClassification || null,
        })
        .eq("id", request.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Solicitação atualizada.");
      void queryClient.invalidateQueries({ queryKey: ["curation-requests-admin"] });
    },
    onError: (error: unknown) => {
      toast.error(
        error instanceof Error ? error.message : "Não foi possível salvar as alterações.",
      );
    },
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        {request && (
          <>
            <SheetHeader>
              <SheetTitle className="pr-6 text-left">
                <span className="mr-2 font-mono text-muted-foreground">
                  #{request.numero_sequencial}
                </span>
                {request.title}
              </SheetTitle>
              <SheetDescription className="text-left">
                Solicitada por {curatorName} em {formatDateTime(request.created_at)}
              </SheetDescription>
            </SheetHeader>

            <div className="mt-6 space-y-6">
              <section className="space-y-2">
                <h3 className="text-sm font-semibold">Descrição</h3>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                  {request.description}
                </p>
              </section>

              <section className="flex flex-wrap gap-2">
                <Badge variant="secondary">
                  Curador: {request.curator_classification ?? "—"}
                </Badge>
                <Badge variant="secondary">Dimensão: {request.curator_dimension ?? "—"}</Badge>
                <Badge variant="outline">
                  Origem: {request.chat_id ? "Chat" : "Avulso"}
                </Badge>
              </section>

              {request.image_url && (
                <section className="space-y-2">
                  <h3 className="text-sm font-semibold">Imagem anexada</h3>
                  <AttachmentImage path={request.image_url} />
                </section>
              )}

              <Separator />

              <section className="space-y-2">
                <h3 className="text-sm font-semibold">Contexto capturado</h3>
                <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <dt>Agente</dt>
                  <dd className="truncate text-foreground">{request.agent_key ?? "—"}</dd>
                  <dt>Chat</dt>
                  <dd className="truncate">{request.chat_id ?? "—"}</dd>
                  <dt>Mensagem</dt>
                  <dd className="truncate">{request.message_id ?? "—"}</dd>
                  <dt>Paciente</dt>
                  <dd className="truncate">{request.patient_id ?? "—"}</dd>
                </dl>
                {request.chat_id && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setConversationOpen(true)}
                  >
                    <ExternalLink className="h-4 w-4" />
                    Ver conversa original
                  </Button>
                )}
              </section>

              <Separator />

              <section className="space-y-2">
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  <Sparkles className="h-4 w-4 text-[#e8a04c]" />
                  Análise da IA
                </h3>
                {request.ai_status === "failed" && (
                  <p className="rounded-md border border-orange-300 bg-orange-50 p-2 text-xs text-orange-900">
                    A análise automática falhou nesta solicitação.
                    {request.ai_error ? ` Motivo: ${request.ai_error}` : ""}
                  </p>
                )}
                <dl className="grid grid-cols-[130px_1fr] gap-x-3 gap-y-1 text-xs">
                  <dt className="text-muted-foreground">Classificação</dt>
                  <dd>{request.ai_classification ?? "Aguardando análise da IA"}</dd>
                  <dt className="text-muted-foreground">Confiança</dt>
                  <dd>
                    {request.ai_confidence_label ??
                      (request.ai_confidence !== null
                        ? `${Math.round(Number(request.ai_confidence) * 100)}%`
                        : "Aguardando análise da IA")}
                  </dd>
                  <dt className="text-muted-foreground">Funcionalidade</dt>
                  <dd>{request.ai_functionality ?? "—"}</dd>
                  <dt className="text-muted-foreground">Item da baseline</dt>
                  <dd>{request.ai_baseline_item ?? "—"}</dd>
                  <dt className="text-muted-foreground">Justificativa</dt>
                  <dd className="whitespace-pre-wrap">
                    {request.ai_justification ?? "Aguardando análise da IA"}
                  </dd>
                  <dt className="text-muted-foreground">Curador × IA</dt>
                  <dd>
                    {request.curator_agreement === "discorda" ? (
                      <span className="font-medium text-destructive">
                        Divergência — curador: {request.curator_classification ?? "—"} · IA:{" "}
                        {request.ai_classification ?? "—"}
                      </span>
                    ) : request.curator_agreement === "concorda" ? (
                      "Curador concordou com a IA"
                    ) : (
                      "Sem resposta do curador"
                    )}
                  </dd>
                  {request.duplicate_of && (
                    <>
                      <dt className="text-muted-foreground">Duplicata de</dt>
                      <dd>#{request.duplicate_of.slice(0, 8)}</dd>
                    </>
                  )}
                </dl>

                {/* Direção técnica: exclusiva do super admin — nunca exposta ao curador. */}
                <div className="rounded-md border bg-muted/30 p-2 text-xs">
                  <p className="mb-1 font-medium">Direção técnica (interno)</p>
                  <TechnicalDirection value={request.ai_technical_direction} />
                </div>
              </section>


              <Separator />

              <section className="space-y-4">
                <h3 className="text-sm font-semibold">Gestão do super admin</h3>

                <div className="space-y-2">
                  <Label>Situação</Label>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_ORDER.map((key) => (
                        <SelectItem key={key} value={key}>
                          {STATUS_LABEL[key]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Classificação final do admin</Label>
                  <Select value={finalClassification} onValueChange={setFinalClassification}>
                    <SelectTrigger>
                      <SelectValue placeholder="Não definida" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="suporte">Suporte</SelectItem>
                      <SelectItem value="melhoria">Melhoria</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="curation-admin-notes">Notas do admin</Label>
                  <Textarea
                    id="curation-admin-notes"
                    rows={5}
                    value={adminNotes}
                    onChange={(event) => setAdminNotes(event.target.value)}
                    placeholder="Anotações internas sobre a decisão, encaminhamento ou ajuste necessário."
                  />
                </div>

                <Button
                  type="button"
                  onClick={() => saveMutation.mutate()}
                  disabled={saveMutation.isPending}
                >
                  {saveMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Salvar alterações
                </Button>
              </section>
            </div>

            <CurationConversationDialog
              requestId={conversationOpen ? request.id : null}
              open={conversationOpen}
              onOpenChange={setConversationOpen}
            />
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
