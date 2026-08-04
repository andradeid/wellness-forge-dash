import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, FileText, Loader2, Plus, Sparkles, ThumbsDown, ThumbsUp, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  createCurationRequest,
  resolveCurationDuplicate,
  setCuratorAgreement,
} from "@/lib/curation.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type Classification = "suporte" | "melhoria";
export type Dimension =
  | "comportamento"
  | "tabela_dado"
  | "formatacao"
  | "clinico"
  | "outro";

export const CLASSIFICATION_LABELS: Record<Classification, string> = {
  suporte: "Suporte",
  melhoria: "Melhoria",
};

export const DIMENSION_LABELS: Record<Dimension, string> = {
  comportamento: "Comportamento",
  tabela_dado: "Tabela / Dado",
  formatacao: "Formatação",
  clinico: "Clínico",
  outro: "Outro",
};

export const ATTACHMENT_BUCKET = "curation-attachments";
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = [
  "image/png", "image/jpeg", "image/jpg", "image/webp",
  "application/pdf", 
  "application/msword", 
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
];

export interface CurationContext {
  chat_id?: string | null;
  message_id?: string | null;
  patient_id?: string | null;
  agent_key?: string | null;
}

interface CurationRequestFormProps {
  context?: CurationContext;
  onSuccess?: () => void;
  submitLabel?: string;
  idPrefix?: string;
}

export function CurationRequestForm({
  context,
  onSuccess,
  submitLabel = "Registrar solicitação",
  idPrefix = "curation",
}: CurationRequestFormProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [classification, setClassification] = useState<Classification | "">("");
  const [dimension, setDimension] = useState<Dimension | "">("");
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  function clearFile() {
    setFile(null);
    setFilePreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleFileChange(selectedFile: File | null) {
    if (!selectedFile) {
      clearFile();
      return;
    }
    if (!ALLOWED_TYPES.includes(selectedFile.type)) {
      toast.error("Formato não suportado. Envie imagem (PNG, JPG, WEBP) ou documento (PDF, DOC).");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    if (selectedFile.size > MAX_FILE_BYTES) {
      toast.error("O arquivo excede o limite de 10 MB.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setFile(selectedFile);
    if (selectedFile.type.startsWith("image/")) {
      setFilePreview((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(selectedFile);
      });
    } else {
      setFilePreview(null);
    }
  }

  const handlePaste = (event: React.ClipboardEvent) => {
    const items = event.clipboardData.items;
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) handleFileChange(file);
        break;
      }
    }
  };

  const createFn = useServerFn(createCurationRequest);
  const duplicateFn = useServerFn(resolveCurationDuplicate);
  const agreementFn = useServerFn(setCuratorAgreement);

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error("Sessão expirada. Entre novamente.");
      const cleanTitle = title.trim();
      const cleanDescription = description.trim();
      if (cleanTitle.length < 3) throw new Error("O título precisa ter ao menos 3 caracteres.");
      if (cleanDescription.length < 10)
        throw new Error("A descrição precisa ter ao menos 10 caracteres.");
      if (!classification) throw new Error("Escolha a classificação.");
      if (!dimension) throw new Error("Escolha a dimensão.");

      let imagePath: string | null = null;
      if (file) {
        const extension = (file.name.split(".").pop() ?? "bin")
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "")
          .slice(0, 5);
        const path = `${user.id}/${crypto.randomUUID()}.${extension || "bin"}`;
        const { error: uploadError } = await supabase.storage
          .from(ATTACHMENT_BUCKET)
          .upload(path, file, {
            contentType: file.type,
            upsert: false,
          });
        if (uploadError) throw new Error("Não foi possível enviar o anexo. Tente novamente.");
        imagePath = path;
      }

      try {
        return await createFn({
          data: {
            title: cleanTitle,
            description: cleanDescription,
            curatorClassification: classification,
            curatorDimension: dimension,
            imagePath,
            attachmentMimeType: file?.type ?? null,
            chatId: context?.chat_id ?? null,
            messageId: context?.message_id ?? null,
            patientId: context?.patient_id ?? null,
            agentKey: context?.agent_key ?? null,
          },
        });
      } catch (error) {
        if (imagePath) {
          await supabase.storage.from(ATTACHMENT_BUCKET).remove([imagePath]);
        }
        throw error;
      }
    },
    onSuccess: (result) => {
      toast.success("Solicitação registrada com sucesso.");
      setTitle("");
      setDescription("");
      setClassification("");
      setDimension("");
      clearFile();
      void queryClient.invalidateQueries({ queryKey: ["curation-requests", "mine", user?.id] });

      const analysis = result?.analysis;
      if (analysis && analysis.ai_status === "done") {
        setReview({ requestId: result.requestId, analysis });
        return;
      }
      toast.message("Análise automática indisponível agora — sua solicitação foi registrada.");
      onSuccess?.();
    },
    onError: (error: unknown) => {
      const message =
        error instanceof Error ? error.message : "Não foi possível registrar a solicitação.";
      toast.error(message);
    },
  });

  const [review, setReview] = useState<{
    requestId: string;
    analysis: {
      classificacao: string | null;
      confianca: string | null;
      justificativa: string | null;
      possivel_duplicata: boolean;
      duplicata: { id: string; status: string; title?: string } | null;
    };
  } | null>(null);
  const [duplicateResolved, setDuplicateResolved] = useState(false);
  const [duplicateInfo, setDuplicateInfo] = useState<{ title: string; status: string } | null>(
    null,
  );
  const [reviewBusy, setReviewBusy] = useState(false);

  function finishReview() {
    setReview(null);
    setDuplicateResolved(false);
    setDuplicateInfo(null);
    void queryClient.invalidateQueries({ queryKey: ["curation-requests", "mine", user?.id] });
    onSuccess?.();
  }

  async function handleDuplicate(isSame: boolean) {
    if (!review?.analysis.duplicata) return;
    setReviewBusy(true);
    try {
      const r = await duplicateFn({
        data: {
          requestId: review.requestId,
          duplicateOf: review.analysis.duplicata.id,
          isSame,
        },
      });
      setDuplicateResolved(true);
      if (r?.linked && r.original) {
        setDuplicateInfo({ title: r.original.title, status: r.original.status });
        toast.message("Já está em análise, aguarde retorno.");
      }
    } catch {
      toast.error("Não foi possível registrar a resposta.");
    } finally {
      setReviewBusy(false);
    }
  }

  async function handleAgreement(agrees: boolean) {
    if (!review) return;
    setReviewBusy(true);
    try {
      await agreementFn({ data: { requestId: review.requestId, agrees } });
      toast.success(agrees ? "Concordância registrada." : "Divergência registrada.");
    } catch {
      toast.error("Não foi possível registrar sua resposta.");
    } finally {
      setReviewBusy(false);
      finishReview();
    }
  }

  const AI_LABELS: Record<string, string> = {
    suporte: "Suporte",
    melhoria: "Melhoria",
    requer_analise_humana: "Requer análise humana",
  };

  if (review) {
    const { analysis } = review;
    const needsDuplicate = analysis.possivel_duplicata && !!analysis.duplicata;

    return (
      <div className="space-y-4">
        {needsDuplicate && !duplicateResolved && (
          <div className="space-y-3 rounded-lg border border-orange-300 bg-orange-50 p-3">
            <p className="flex items-start gap-2 text-sm text-orange-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Esta solicitação parece com uma já registrada (#
                {analysis.duplicata!.id.slice(0, 8)}, situação: {analysis.duplicata!.status}
                ). É o mesmo problema?
              </span>
            </p>
            <div className="flex gap-2">
              <Button size="sm" disabled={reviewBusy} onClick={() => void handleDuplicate(true)}>
                Sim, é o mesmo
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={reviewBusy}
                onClick={() => void handleDuplicate(false)}
              >
                Não, é diferente
              </Button>
            </div>
          </div>
        )}

        {duplicateInfo && (
          <div className="rounded-lg border bg-muted/40 p-3 text-sm">
            <p className="font-medium">Já está em análise, aguarde retorno.</p>
            <p className="text-muted-foreground">
              Solicitação original: “{duplicateInfo.title}” — situação: {duplicateInfo.status}.
            </p>
          </div>
        )}

        {(!needsDuplicate || duplicateResolved) && (
          <div className="space-y-3 rounded-lg border bg-card p-3">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <Sparkles className="h-4 w-4 text-[#e8a04c]" />
              Análise automática
            </p>
            <p className="text-sm">
              Classificação:{" "}
              <span className="font-medium">
                {AI_LABELS[analysis.classificacao ?? ""] ?? analysis.classificacao}
              </span>
              {analysis.confianca ? (
                <span className="text-muted-foreground"> · confiança {analysis.confianca}</span>
              ) : null}
            </p>
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">
              {analysis.justificativa}
            </p>
            <p className="text-sm font-medium">Você concorda com essa classificação?</p>
            <div className="flex gap-2">
              <Button size="sm" disabled={reviewBusy} onClick={() => void handleAgreement(true)}>
                <ThumbsUp className="h-4 w-4" />
                Concordo
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={reviewBusy}
                onClick={() => void handleAgreement(false)}
              >
                <ThumbsDown className="h-4 w-4" />
                Não concordo
              </Button>
              <Button size="sm" variant="ghost" disabled={reviewBusy} onClick={finishReview}>
                Fechar
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <form
      className="space-y-4"
      onPaste={handlePaste}
      onSubmit={(event) => {
        event.preventDefault();
        createMutation.mutate();
      }}
    >
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-title`}>Título</Label>
        <Input
          id={`${idPrefix}-title`}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Resumo em uma linha"
          maxLength={200}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-description`}>Descrição</Label>
        <Textarea
          id={`${idPrefix}-description`}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Explique o contexto, o que era esperado e o que aconteceu."
          rows={5}
          required
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Classificação</Label>
          <Select
            value={classification}
            onValueChange={(value) => setClassification(value as Classification)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(CLASSIFICATION_LABELS) as Classification[]).map((key) => (
                <SelectItem key={key} value={key}>
                  {CLASSIFICATION_LABELS[key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Dimensão</Label>
          <Select value={dimension} onValueChange={(value) => setDimension(value as Dimension)}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(DIMENSION_LABELS) as Dimension[]).map((key) => (
                <SelectItem key={key} value={key}>
                  {DIMENSION_LABELS[key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-attachment`}>Anexo (opcional)</Label>
        <Input
          id={`${idPrefix}-attachment`}
          ref={fileInputRef}
          type="file"
          accept={ALLOWED_TYPES.join(",")}
          onChange={(event) => handleFileChange(event.target.files?.[0] ?? null)}
        />
        <p className="text-xs text-muted-foreground">
          Envie um print (PNG, JPG) ou documento (PDF, DOC) de até 10 MB. Você também pode colar uma imagem (Ctrl+V).
        </p>
        {file && (
          <div className="flex items-center gap-3 rounded-md border p-2">
            {filePreview ? (
              <img
                src={filePreview}
                alt="Pré-visualização"
                className="h-14 w-14 rounded object-cover"
              />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded bg-muted">
                <FileText className="h-6 w-6 text-muted-foreground" />
              </div>
            )}
            <div className="flex-1 overflow-hidden">
              <p className="truncate text-xs font-medium">{file.name}</p>
              <p className="text-[10px] text-muted-foreground">
                {(file.size / 1024 / 1024).toFixed(2)} MB
              </p>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={clearFile}>
              <X className="h-4 w-4" />
              Remover
            </Button>
          </div>
        )}
      </div>

      <Button type="submit" disabled={createMutation.isPending}>
        {createMutation.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Plus className="h-4 w-4" />
        )}
        {submitLabel}
      </Button>
    </form>
  );
}