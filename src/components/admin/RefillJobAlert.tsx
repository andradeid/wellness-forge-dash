import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

/** Janela máxima sem registro de sucesso da reposição diária (roda 05:10 UTC). */
const MAX_GAP_MS = 26 * 60 * 60 * 1000;

interface RefillLog {
  created_at: string;
  status: string;
  message: string | null;
}

/**
 * Aviso no painel quando a reposição mensal de créditos falhou
 * ou não registrou execução nas últimas 26 horas.
 */
export function RefillJobAlert() {
  const { data, isLoading } = useQuery({
    queryKey: ["refill-job-last-run"],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<RefillLog | null> => {
      const { data, error } = await (supabase as any)
        .from("integration_logs")
        .select("created_at, status, message")
        .eq("event", "refill_monthly_credits")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as RefillLog | null;
    },
  });

  if (isLoading) return null;

  const last = data ?? null;
  const stale = !last || Date.now() - new Date(last.created_at).getTime() > MAX_GAP_MS;
  const failed = last?.status === "error";
  if (!stale && !failed) return null;

  const when = last
    ? new Date(last.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
    : "nunca";

  return (
    <div
      role="alert"
      className="mb-6 flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm"
    >
      <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" />
      <div>
        <p className="font-medium text-foreground">
          {failed ? "A reposição mensal de créditos falhou" : "A reposição mensal de créditos não rodou hoje"}
        </p>
        <p className="text-muted-foreground">
          Último registro: {when}
          {failed && last?.message ? ` — ${last.message}` : ""}. Contas com renovação vencida podem estar sem créditos.
        </p>
      </div>
    </div>
  );
}
