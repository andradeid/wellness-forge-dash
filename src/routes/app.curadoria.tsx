import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ImageIcon, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import {
  CurationRequestForm,
  CLASSIFICATION_LABELS,
  DIMENSION_LABELS,
  ATTACHMENT_BUCKET,
  type Classification,
  type Dimension,
} from "@/components/curadoria/CurationRequestForm";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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

  const allowed = role === "curator" || role === "super_admin";


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
          <CurationRequestForm />

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
                    <TableCell>
                      {row.image_url ? (
                        <AttachmentThumbnail path={row.image_url} />
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
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
