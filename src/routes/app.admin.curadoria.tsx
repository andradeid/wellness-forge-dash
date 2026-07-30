import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/app/admin/curadoria")({
  component: CuradoriaPage,
  head: () => ({
    meta: [
      { title: "Curadoria de Feedback | LUMMA" },
      {
        name: "description",
        content:
          "Painel interno de curadoria de feedback clínico da Lumma: acompanhe as solicitações registradas pelas nutricionistas.",
      },
      { property: "og:title", content: "Curadoria de Feedback | LUMMA" },
      {
        property: "og:description",
        content:
          "Painel interno de curadoria de feedback clínico da Lumma: acompanhe as solicitações registradas pelas nutricionistas.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

/** Situações possíveis de uma solicitação de curadoria. */
type CurationStatus =
  | "registrado"
  | "em_analise"
  | "classificado"
  | "aprovado"
  | "rejeitado"
  | "arquivado";

interface CurationRequestRow {
  id: string;
  created_at: string;
  title: string;
  request_type: string;
  priority: string;
  status: CurationStatus;
  agent_key: string | null;
  created_by: string;
}

const STATUS_LABEL: Record<CurationStatus, string> = {
  registrado: "Registrado",
  em_analise: "Em análise",
  classificado: "Classificado",
  aprovado: "Aprovado",
  rejeitado: "Rejeitado",
  arquivado: "Arquivado",
};

const TYPE_LABEL: Record<string, string> = {
  resposta_incorreta: "Resposta incorreta",
  resposta_incompleta: "Resposta incompleta",
  alucinacao: "Alucinação",
  formatacao: "Formatação",
  sugestao_melhoria: "Sugestão de melhoria",
  outro: "Outro",
};

const PRIORITY_LABEL: Record<string, string> = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
  critica: "Crítica",
};

function formatDateBR(iso: string): string {
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function CuradoriaPage() {
  const { role, loading: authLoading } = useAuth();
  const isSuperAdmin = role === "super_admin";

  const { data, isLoading, error } = useQuery({
    queryKey: ["curation-requests"],
    enabled: isSuperAdmin,
    staleTime: 30_000,
    queryFn: async (): Promise<CurationRequestRow[]> => {
      const { data, error } = await (supabase as any)
        .from("curation_requests")
        .select(
          "id, created_at, title, request_type, priority, status, agent_key, created_by",
        )
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as CurationRequestRow[];
    },
  });

  if (authLoading) {
    return <Skeleton className="h-64 w-full rounded-lg" />;
  }

  if (!isSuperAdmin) {
    return (
      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle>Acesso restrito</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Esta área é exclusiva do super administrador.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-gradient-to-br from-[#e8a04c] to-[#e89bcf] p-2 text-white">
          <ClipboardList className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-foreground">
            Curadoria de Feedback
          </h1>
          <p className="text-sm text-muted-foreground">
            Solicitações registradas para revisão clínica. Estrutura inicial —
            sem criação e sem análise por IA nesta etapa.
          </p>
        </div>
      </div>

      <Card className="rounded-lg shadow-md">
        <CardHeader>
          <CardTitle className="text-base">
            Solicitações {data ? `(${data.length})` : ""}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : error ? (
            <p className="text-sm text-destructive">
              Não foi possível carregar as solicitações. Tente novamente em
              instantes.
            </p>
          ) : !data || data.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhuma solicitação de curadoria registrada até o momento.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Título</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Prioridade</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead>Agente</TableHead>
                  <TableHead>Criado em</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="max-w-[280px] truncate font-medium">
                      {row.title}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {TYPE_LABEL[row.request_type] ?? row.request_type}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {PRIORITY_LABEL[row.priority] ?? row.priority}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {STATUS_LABEL[row.status] ?? row.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.agent_key ?? "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatDateBR(row.created_at)}
                    </TableCell>
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
