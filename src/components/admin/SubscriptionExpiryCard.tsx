import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, differenceInHours } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** Uma assinatura no panorama de vencimentos. */
export interface ExpiryRow {
  user_id: string;
  email: string | null;
  full_name: string | null;
  plano: string | null;
  situacao: string | null;
  current_period_end: string;
  origem: string | null;
  dias_restantes: number;
  dias_vencida: number;
  ultimo_uso: string | null;
}

interface JobHealth {
  status: string | null;
  start_time: string | null;
  return_message: string | null;
}

interface ExpiryOverview {
  counts: { venc7: number; venc30: number; vencidas: number; vencidasComUso: number };
  listas: {
    venc7: ExpiryRow[];
    venc30: ExpiryRow[];
    vencidas: ExpiryRow[];
    vencidasComUso: ExpiryRow[];
  };
  job: JobHealth | null;
}

type ListKey = keyof ExpiryOverview["listas"];

const LIST_LABEL: Record<ListKey, string> = {
  venc7: "Vencendo nos próximos 7 dias",
  venc30: "Vencendo nos próximos 30 dias",
  vencidas: "Já vencidas e ainda ativas",
  vencidasComUso: "Vencidas com uso nos últimos 7 dias",
};

const ORIGEM_LABEL: Record<string, string> = {
  stripe: "Stripe",
  kiwify: "Kiwify",
  migracao_lumma1: "Migração Lumma 1",
  interno: "Interno",
  manual: "Manual",
};

const PLANO_LABEL: Record<string, string> = {
  free: "Gratuito",
  starter: "Starter",
  pro: "Pro",
  legado_500: "Legado 500",
};

function fmtDate(v: string | null): string {
  if (!v) return "—";
  try {
    return format(new Date(v), "dd/MM/yyyy", { locale: ptBR });
  } catch {
    return "—";
  }
}

export function SubscriptionExpiryCard() {
  const [open, setOpen] = useState<ListKey | null>(null);

  const query = useQuery({
    queryKey: ["admin-subscription-expiry"],
    staleTime: 60_000,
    queryFn: async (): Promise<ExpiryOverview> => {
      const { data, error } = await (supabase as any).rpc("admin_subscription_expiry_overview");
      if (error) throw error;
      return data as ExpiryOverview;
    },
  });

  const d = query.data;

  const jobAlert = useMemo(() => {
    const job = d?.job ?? null;
    if (!job?.start_time) {
      return { level: "warn" as const, text: "A rotina diária ainda não registrou nenhuma execução." };
    }
    const horas = differenceInHours(new Date(), new Date(job.start_time));
    if (job.status !== "succeeded") {
      return {
        level: "error" as const,
        text: `Última execução falhou em ${fmtDate(job.start_time)}${job.return_message ? ` — ${job.return_message}` : ""}.`,
      };
    }
    if (horas > 48) {
      return { level: "error" as const, text: `A rotina não roda há ${horas}h (última em ${fmtDate(job.start_time)}).` };
    }
    return { level: "ok" as const, text: `Última execução com sucesso em ${fmtDate(job.start_time)}.` };
  }, [d?.job]);

  return (
    <Card className="p-6 rounded-2xl">
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-semibold text-sm">Assinaturas e vencimentos</h3>
        <span className="text-xs text-muted-foreground">somente monitoramento · nada é bloqueado</span>
      </div>
      <p className="text-xs text-muted-foreground mb-4">Clique em um número para ver a lista completa.</p>

      {query.isLoading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Carregando vencimentos...</p>
      ) : query.isError || !d ? (
        <p className="py-8 text-center text-sm text-destructive">Não foi possível carregar os vencimentos.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <ExpiryTile label="Vencendo em 7 dias" value={d.counts.venc7} onClick={() => setOpen("venc7")} tone="warn" />
            <ExpiryTile label="Vencendo em 30 dias" value={d.counts.venc30} onClick={() => setOpen("venc30")} tone="neutral" />
            <ExpiryTile label="Vencidas e ativas" value={d.counts.vencidas} onClick={() => setOpen("vencidas")} tone="danger" />
            <ExpiryTile
              label="Vencidas com uso em 7d"
              value={d.counts.vencidasComUso}
              onClick={() => setOpen("vencidasComUso")}
              tone="danger"
            />
          </div>

          <div
            className={cn(
              "mt-4 flex items-start gap-2 rounded-lg border px-3 py-2 text-xs",
              jobAlert.level === "ok" && "border-border text-muted-foreground",
              jobAlert.level === "warn" && "border-amber-300 bg-amber-50 text-amber-900",
              jobAlert.level === "error" && "border-destructive/40 bg-destructive/10 text-destructive",
            )}
          >
            {jobAlert.level === "ok" ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-px" />
            ) : jobAlert.level === "warn" ? (
              <Clock className="h-4 w-4 shrink-0 mt-px" />
            ) : (
              <AlertTriangle className="h-4 w-4 shrink-0 mt-px" />
            )}
            <span>
              <strong className="font-medium">Rotina de expiração:</strong> {jobAlert.text}
            </span>
          </div>
        </>
      )}

      <Dialog open={open !== null} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>{open ? LIST_LABEL[open] : ""}</DialogTitle>
            <DialogDescription>
              {open && d ? `${d.listas[open].length} assinatura(s). Nenhuma ação é aplicada aqui.` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-auto rounded-lg border border-border">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted/60 backdrop-blur">
                <tr className="text-left">
                  <th className="px-3 py-2 font-medium">Nome</th>
                  <th className="px-3 py-2 font-medium">E-mail</th>
                  <th className="px-3 py-2 font-medium">Plano</th>
                  <th className="px-3 py-2 font-medium">Vencimento</th>
                  <th className="px-3 py-2 font-medium">Dias</th>
                  <th className="px-3 py-2 font-medium">Origem</th>
                  <th className="px-3 py-2 font-medium">Último uso</th>
                </tr>
              </thead>
              <tbody>
                {open &&
                  d?.listas[open].map((r) => {
                    const vencida = r.dias_vencida > 0;
                    return (
                      <tr key={r.user_id} className="border-t border-border">
                        <td className="px-3 py-2">{r.full_name ?? "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground">{r.email ?? "—"}</td>
                        <td className="px-3 py-2">{PLANO_LABEL[r.plano ?? ""] ?? r.plano ?? "—"}</td>
                        <td className="px-3 py-2">{fmtDate(r.current_period_end)}</td>
                        <td className={cn("px-3 py-2", vencida && "text-destructive font-medium")}>
                          {vencida ? `${r.dias_vencida} vencida` : `${Math.max(0, r.dias_restantes)} restantes`}
                        </td>
                        <td className="px-3 py-2">
                          <Badge variant="secondary" className="font-normal">
                            {ORIGEM_LABEL[r.origem ?? ""] ?? r.origem ?? "—"}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{fmtDate(r.ultimo_uso)}</td>
                      </tr>
                    );
                  })}
                {open && d?.listas[open].length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                      Nenhuma assinatura nesta condição.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function ExpiryTile({
  label,
  value,
  onClick,
  tone,
}: {
  label: string;
  value: number;
  onClick: () => void;
  tone: "neutral" | "warn" | "danger";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-xl border p-4 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        tone === "neutral" && "border-border",
        tone === "warn" && "border-amber-300 bg-amber-50/60",
        tone === "danger" && value > 0 && "border-destructive/40 bg-destructive/5",
        tone === "danger" && value === 0 && "border-border",
      )}
    >
      <p className="text-2xl font-semibold tracking-tight">{value.toLocaleString("pt-BR")}</p>
      <p className="text-xs text-muted-foreground mt-1">{label}</p>
    </button>
  );
}
