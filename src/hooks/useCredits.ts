import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyCredits, getAgentCost, consumeCredits } from "@/lib/credits.functions";
import { useAuth } from "@/hooks/useAuth";

export function useMyCredits() {
  const { user } = useAuth();
  const fn = useServerFn(getMyCredits);
  return useQuery({
    queryKey: ["credits", user?.id],
    queryFn: () => fn(),
    enabled: !!user?.id,
    staleTime: 30_000,
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
