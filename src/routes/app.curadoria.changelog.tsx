import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarDays, CheckCircle2, Link2, Sparkles, Clock, FileText } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getChangelogRounds,
  type ChangelogItemView,
  type ChangelogRoundView,
} from "@/lib/changelog.functions";

export const Route = createFileRoute("/app/curadoria/changelog")({
  component: ChangelogPage,
});

const CAMADA_LABELS: Record<string, string> = {
  dify: "Agente",
  lovable: "Interface",
  banco: "Sistema",
  kb: "Base de conhecimento",
};

function formatDate(value?: string | null) {
  if (!value) return "";
  const [y, m, d] = String(value).slice(0, 10).split("-");
  return d && m && y ? `${d}/${m}/${y}` : String(value);
}

function ChangelogPage() {
  const { role, loading } = useAuth();
  const isCuradoria = role === "curator" || role === "super_admin";
  const fetchRounds = useServerFn(getChangelogRounds);

  const query = useQuery({
    queryKey: ["changelog-rounds"],
    enabled: isCuradoria,
    staleTime: 5 * 60 * 1000,
    queryFn: () => fetchRounds(),
  });

  if (loading) {
    return <div className="text-sm text-muted-foreground">Carregando...</div>;
  }

  if (!isCuradoria) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Acesso restrito</CardTitle>
          <CardDescription>Esta área é exclusiva do time de curadoria.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const isFull = query.data?.isFull ?? false;
  const rounds = query.data?.rounds ?? [];

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Changelog de ajustes</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Registro das rodadas de ajustes aplicadas em produção, da mais recente para a mais
          antiga.
        </p>
      </div>

      {query.isLoading ? (
        <div className="text-sm text-muted-foreground">Carregando rodadas...</div>
      ) : query.isError ? (
        <div className="text-sm text-destructive">Não foi possível carregar o changelog.</div>
      ) : rounds.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <CalendarDays className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">
              Nenhuma rodada de ajustes registrada ainda
            </p>
            <p className="max-w-md text-sm text-muted-foreground">
              Assim que a primeira leva de ajustes for aplicada em produção, ela aparecerá aqui
              com as correções e melhorias da semana.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-5">
          {rounds.map((round) => (
            <RoundCard key={round.id} round={round} isFull={isFull} />
          ))}
        </div>
      )}
    </div>
  );
}

function RoundCard({ round, isFull }: { round: ChangelogRoundView; isFull: boolean }) {
  const correcoes = round.itens.filter((i) => i.tipo === "suporte");
  const melhorias = round.itens.filter((i) => i.tipo === "melhoria");
  const infra = round.itens.filter((i) => i.tipo === "infra");

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">{round.titulo}</CardTitle>
            <CardDescription>
              Período: {formatDate(round.rodada_data)} {round.rodada_data_fim ? `a ${formatDate(round.rodada_data_fim)}` : ""}
            </CardDescription>
          </div>
          <span className="bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] bg-clip-text text-xs font-semibold uppercase tracking-wide text-transparent">
            {round.itens.length} {round.itens.length === 1 ? "ajuste" : "ajustes"}
          </span>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {correcoes.length > 0 && (
          <ItemGroup
            title="Correções"
            icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />}
            items={correcoes}
            isFull={isFull}
            fallbackDate={round.rodada_data}
          />
        )}

        {melhorias.length > 0 && (
          <ItemGroup
            title="Melhorias"
            icon={<Sparkles className="h-4 w-4 text-orange-500" />}
            items={melhorias}
            isFull={isFull}
            fallbackDate={round.rodada_data}
          />
        )}

        {infra.length > 0 && (
          <ItemGroup
            title="Infraestrutura"
            icon={<CalendarDays className="h-4 w-4 text-blue-500" />}
            items={infra}
            isFull={isFull}
            fallbackDate={round.rodada_data}
          />
        )}


        {isFull && round.notas_admin && (
          <div className="space-y-2 border-t pt-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <FileText className="h-4 w-4 text-purple-500" />
              Notas da rodada (Admin)
            </div>
            <div className="rounded-lg border bg-purple-50/30 p-3">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                {round.notas_admin}
              </p>
            </div>
          </div>
        )}

        {round.itens.length === 0 && (
          <p className="text-sm text-muted-foreground">Rodada sem itens registrados.</p>
        )}

        {isFull && round.itens.length > 0 && <TechnicalTable items={round.itens} />}
      </CardContent>
    </Card>
  );
}

function ItemGroup({
  title,
  icon,
  items,
  isFull,
}: {
  title: string;
  icon: React.ReactNode;
  items: ChangelogItemView[];
  isFull: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        {icon}
        {title}
        <span className="text-xs font-normal text-muted-foreground">({items.length})</span>
      </div>

      <div className="space-y-2">
        {items.map((item) => {
          const parts = item.descricao_legivel.split('\n');
          const title = parts[0];
          const rest = parts.slice(1).join('\n').trim();

          // Se o banco ainda tiver literais '\n', precisamos substituí-los.
          // Mas como já usamos whitespace-pre-wrap, o split por \n real já funciona.
          // Se o usuário vê literal \n no preview, é porque o dado no banco contém o caractere '\' seguido de 'n'.
          const cleanTitle = title.replace(/\\n/g, '\n');
          const cleanRest = rest.replace(/\\n/g, '\n');

          return (
            <div key={item.id} className="rounded-lg border bg-card p-3 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <p className="text-sm font-bold leading-relaxed text-foreground whitespace-pre-wrap">
                    {cleanTitle}
                  </p>
                  {cleanRest && (
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">
                      {cleanRest}
                    </p>
                  )}
                </div>
                <span className="shrink-0 text-[10px] font-medium text-muted-foreground uppercase">
                  {formatDate(item.item_data)}
                </span>
              </div>

              {item.reports.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {item.reports.map((report, index) => (
                    <span
                      key={`${item.id}-${index}`}
                      className={
                        report.mine
                          ? "inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-800"
                          : "inline-flex items-center gap-1.5 rounded-full border bg-muted px-2.5 py-0.5 text-xs text-muted-foreground"
                      }
                      title={report.title}
                    >
                      <Link2 className="h-3 w-3 shrink-0" />
                      {report.mine
                        ? "Sua solicitação foi resolvida nesta rodada"
                        : `Solicitação: ${report.title}`}
                    </span>
                  ))}
                </div>
              )}

              {isFull && (
                <div className="mt-2 flex flex-wrap items-center gap-2 border-t pt-2">
                  {item.camada && (
                    <Badge variant="secondary">{CAMADA_LABELS[item.camada] ?? item.camada}</Badge>
                  )}
                  <Badge variant="outline">
                    {item.tipo === "suporte"
                      ? "Suporte"
                      : item.tipo === "melhoria"
                        ? "Melhoria"
                        : "Infra"}
                  </Badge>
                  {item.descricao_tecnica && (
                    <span className="text-xs leading-relaxed text-muted-foreground">
                      {item.descricao_tecnica}
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Visão técnica consolidada — apenas super admin. */
function TechnicalTable({ items }: { items: ChangelogItemView[] }) {
  const porCamada = items.reduce<Record<string, number>>((acc, item) => {
    const key = item.camada ?? "—";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Resumo técnico da rodada
      </p>
      <div className="flex flex-wrap gap-2 text-xs">
        <Badge variant="outline">Total: {items.length}</Badge>
        <Badge variant="outline">
          Suporte: {items.filter((i) => i.tipo === "suporte").length}
        </Badge>
        <Badge variant="outline">
          Melhoria: {items.filter((i) => i.tipo === "melhoria").length}
        </Badge>
        <Badge variant="outline">
          Infra: {items.filter((i) => i.tipo === "infra").length}
        </Badge>
        {Object.entries(porCamada).map(([camada, total]) => (
          <Badge key={camada} variant="secondary">
            {CAMADA_LABELS[camada] ?? camada}: {total}
          </Badge>
        ))}
      </div>
    </div>
  );
}
