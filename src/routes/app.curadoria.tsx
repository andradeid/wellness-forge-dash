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

interface CurationRow {
  id: string;
  title: string;
  curator_classification: string | null;
  curator_dimension: string | null;
  status: string;
  created_at: string;
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function CuradoriaPage() {
  const { user, role, loading } = useAuth();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [classification, setClassification] = useState<Classification | "">("");
  const [dimension, setDimension] = useState<Dimension | "">("");

  const allowed = role === "curator" || role === "super_admin";

  const listQuery = useQuery({
    queryKey: ["curation-requests", "mine", user?.id],
    enabled: !!user?.id && allowed,
    queryFn: async (): Promise<CurationRow[]> => {
      const { data, error } = await (supabase as any)
        .from("curation_requests")
        .select("id, title, curator_classification, curator_dimension, status, created_at")
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

      const { error } = await (supabase as any).from("curation_requests").insert({
        created_by: user.id,
        title: cleanTitle,
        description: cleanDescription,
        curator_classification: classification,
        curator_dimension: dimension,
        status: "registrado",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Solicitação registrada com sucesso.");
      setTitle("");
      setDescription("");
      setClassification("");
      setDimension("");
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
