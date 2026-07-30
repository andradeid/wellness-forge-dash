import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, Loader2, Plus, Sparkles, ThumbsDown, ThumbsUp, X } from "lucide-react";
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
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp"];

/** Contexto capturado automaticamente quando o report parte de uma mensagem do chat. */
export interface CurationContext {
  chat_id?: string | null;
  message_id?: string | null;
  patient_id?: string | null;
  agent_key?: string | null;
}

interface CurationRequestFormProps {
  /** Preenchido apenas quando o formulário é aberto a partir do chat. */
  context?: CurationContext;
  /** Callback após criação bem-sucedida (ex.: fechar o modal). */
  onSuccess?: () => void;
  submitLabel?: string;
  /** Prefixo dos ids dos campos — evita colisão quando página e modal coexistem. */
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
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  function clearImage() {
    setImageFile(null);
    setImagePreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleImageChange(file: File | null) {
    if (!file) {
      clearImage();
      return;
    }
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      toast.error("Formato inválido. Envie uma imagem PNG, JPG ou WEBP.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error("A imagem excede o limite de 5 MB.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setImageFile(file);
    setImagePreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
  }

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
      if (imageFile) {
        if (!ALLOWED_IMAGE_TYPES.includes(imageFile.type))
          throw new Error("Formato inválido. Envie uma imagem PNG, JPG ou WEBP.");
        if (imageFile.size > MAX_IMAGE_BYTES)
          throw new Error("A imagem excede o limite de 5 MB.");

        const extension = (imageFile.name.split(".").pop() ?? "png")
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "")
          .slice(0, 5);
        const path = `${user.id}/${crypto.randomUUID()}.${extension || "png"}`;
        const { error: uploadError } = await supabase.storage
          .from(ATTACHMENT_BUCKET)
          .upload(path, imageFile, {
            contentType: imageFile.type,
            upsert: false,
          });
        if (uploadError) throw new Error("Não foi possível enviar a imagem. Tente novamente.");
        imagePath = path;
      }

      const { error } = await (supabase as any).from("curation_requests").insert({
        created_by: user.id,
        title: cleanTitle,
        description: cleanDescription,
        curator_classification: classification,
        curator_dimension: dimension,
        status: "registrado",
        image_url: imagePath,
        ...(context?.chat_id ? { chat_id: context.chat_id } : {}),
        ...(context?.message_id ? { message_id: context.message_id } : {}),
        ...(context?.patient_id ? { patient_id: context.patient_id } : {}),
        ...(context?.agent_key ? { agent_key: context.agent_key } : {}),
      });
      if (error) {
        if (imagePath) {
          await supabase.storage.from(ATTACHMENT_BUCKET).remove([imagePath]);
        }
        throw error;
      }
    },
    onSuccess: () => {
      toast.success("Solicitação registrada com sucesso.");
      setTitle("");
      setDescription("");
      setClassification("");
      setDimension("");
      clearImage();
      void queryClient.invalidateQueries({ queryKey: ["curation-requests", "mine", user?.id] });
      onSuccess?.();
    },
    onError: (error: unknown) => {
      const message =
        error instanceof Error ? error.message : "Não foi possível registrar a solicitação.";
      toast.error(message);
    },
  });

  return (
    <form
      className="space-y-4"
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
        <Label htmlFor={`${idPrefix}-image`}>Imagem (opcional)</Label>
        <Input
          id={`${idPrefix}-image`}
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(event) => handleImageChange(event.target.files?.[0] ?? null)}
        />
        <p className="text-xs text-muted-foreground">
          Anexe 1 print de tela em PNG, JPG ou WEBP (até 5 MB).
        </p>
        {imagePreview && (
          <div className="flex items-center gap-3 rounded-md border p-2">
            <img
              src={imagePreview}
              alt="Pré-visualização da imagem selecionada"
              className="h-14 w-14 rounded object-cover"
            />
            <span className="flex-1 truncate text-xs text-muted-foreground">
              {imageFile?.name}
            </span>
            <Button type="button" variant="ghost" size="sm" onClick={clearImage}>
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
