import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ImageIcon, Loader2, Plus, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/app/curadoria")({
  component: CuradoriaPage,
});

type Classification = "suporte" | "melhoria";
type Dimension =
  | "comportamento"
  | "tabela_dado"
  | "formatacao"
  | "clinico"
  | "outro";

const CLASSIFICATION_LABELS: Record<Classification, string> = {
  suporte: "Suporte",
  melhoria: "Melhoria",
};

const DIMENSION_LABELS: Record<Dimension, string> = {
  comportamento: "Comportamento",
  tabela_dado: "Tabela / Dado",
  formatacao: "Formatação",
  clinico: "Clínico",
  outro: "Outro",
};

const STATUS_LABELS: Record<string, string> = {
  registrado: "Registrado",
  em_analise: "Em análise",
  classificado: "Classificado",
  aprovado: "Aprovado",
  rejeitado: "Rejeitado",
  arquivado: "Arquivado",
};

const ATTACHMENT_BUCKET = "curation-attachments";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp"];

interface CurationRow {
  id: string;
  title: string;
  curator_classification: string | null;
  curator_dimension: string | null;
  status: string;
  created_at: string;
  image_url: string | null;
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function AttachmentThumbnail({ path }: { path: string }) {
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

  if (isLoading) {
    return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
  }

  if (!data) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <ImageIcon className="h-3.5 w-3.5" />
        Anexo
      </span>
    );
  }

  return (
    <a href={data} target="_blank" rel="noreferrer" title="Abrir imagem anexada">
      <img
        src={data}
        alt="Miniatura da imagem anexada à solicitação"
        loading="lazy"
        className="h-10 w-10 rounded-md border object-cover transition-opacity hover:opacity-80"
      />
    </a>
  );
}


function CuradoriaPage() {
  const { user, role, loading } = useAuth();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [classification, setClassification] = useState<Classification | "">("");
  const [dimension, setDimension] = useState<Dimension | "">("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const allowed = role === "curator" || role === "super_admin";

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

  const listQuery = useQuery({
    queryKey: ["curation-requests", "mine", user?.id],
    enabled: !!user?.id && allowed,
    queryFn: async (): Promise<CurationRow[]> => {
      const { data, error } = await (supabase as any)
        .from("curation_requests")
        .select("id, title, curator_classification, curator_dimension, status, created_at, image_url")
        .eq("created_by", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CurationRow[];
    },
  });

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
    },
    onError: (error: unknown) => {
      const message =
        error instanceof Error ? error.message : "Não foi possível registrar a solicitação.";
      toast.error(message);
    },
  });


  if (loading) {
    return <div className="text-sm text-muted-foreground">Carregando...</div>;
  }

  if (!allowed) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Acesso restrito</CardTitle>
          <CardDescription>
            Esta área é exclusiva do time de curadoria.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Curadoria</h1>
        <p className="text-sm text-muted-foreground">
          Registre solicitações de suporte ou melhoria e acompanhe o andamento.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nova solicitação</CardTitle>
          <CardDescription>
            Descreva com clareza o que aconteceu ou o que pode melhorar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              createMutation.mutate();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="curation-title">Título</Label>
              <Input
                id="curation-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Resumo em uma linha"
                maxLength={200}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="curation-description">Descrição</Label>
              <Textarea
                id="curation-description"
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
                <Select
                  value={dimension}
                  onValueChange={(value) => setDimension(value as Dimension)}
                >
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
              <Label htmlFor="curation-image">Imagem (opcional)</Label>
              <Input
                id="curation-image"
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
              Registrar solicitação
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Minhas solicitações</CardTitle>
          <CardDescription>Apenas leitura nesta etapa.</CardDescription>
        </CardHeader>
        <CardContent>
          {listQuery.isLoading ? (
            <div className="text-sm text-muted-foreground">Carregando solicitações...</div>
          ) : listQuery.isError ? (
            <div className="text-sm text-destructive">
              Não foi possível carregar suas solicitações.
            </div>
          ) : (listQuery.data?.length ?? 0) === 0 ? (
            <div className="text-sm text-muted-foreground">
              Você ainda não registrou nenhuma solicitação.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Título</TableHead>
                  <TableHead>Classificação</TableHead>
                  <TableHead>Dimensão</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Imagem</TableHead>
                  <TableHead>Criada em</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {listQuery.data!.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.title}</TableCell>
                    <TableCell>
                      {row.curator_classification
                        ? (CLASSIFICATION_LABELS[row.curator_classification as Classification] ??
                          row.curator_classification)
                        : "—"}
                    </TableCell>
                    <TableCell>
                      {row.curator_dimension
                        ? (DIMENSION_LABELS[row.curator_dimension as Dimension] ??
                          row.curator_dimension)
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {STATUS_LABELS[row.status] ?? row.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatDate(row.created_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
