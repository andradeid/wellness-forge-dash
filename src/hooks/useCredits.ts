import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyCredits, getAgentCost, consumeCredits } from "@/lib/credits.functions";
import { useAuth } from "@/hooks/useAuth";

export function useMyCredits() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["credits", user?.id],
    queryFn: async () => {
      // Chamada direta (sem useServerFn): o wrapper do router repassa o
      // Response 401 (logout/troca de sessão) como erro global e derrubava a
      // tela. Aqui qualquer falha vira `null` e a UI usa o fallback de saldo.
      try {
        return await getMyCredits();
      } catch {
        return null;
      }
    },
    enabled: !!user?.id,
    staleTime: 30_000,
    retry: false,
    throwOnError: false,
  });
}


export function useCreditsActions() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const fnCost = useServerFn(getAgentCost);
  const fnConsume = useServerFn(consumeCredits);

  return {
    /** Lê o custo do agente. */
    getCost: (agentKey: string) => fnCost({ data: { agentKey } }),
    /** Debita após a resposta da IA. Invalida a query do header. */
    consume: async (agentKey: string, messagePreview?: string) => {
      const r = await fnConsume({ data: { agentKey, messagePreview } });
      await qc.invalidateQueries({ queryKey: ["credits", user?.id] });
      return r;
    },
    refresh: () => qc.invalidateQueries({ queryKey: ["credits", user?.id] }),
  };
}
