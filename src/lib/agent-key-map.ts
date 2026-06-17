/**
 * Mapeia o `agent_id` usado no frontend/dify_agents para o `agent_key`
 * cadastrado na tabela `agent_costs` (LUMMA 2 — billing de créditos).
 *
 * Se um agente novo for criado, adicione o mapeamento aqui. Caso contrário
 * `consume_credits` não encontrará a chave e o débito será ignorado.
 */
const MAP: Record<string, string> = {
  // Exames laboratoriais (todos os módulos clínicos)
  exam: "exames_laboratoriais",
  exam_masculino: "exames_laboratoriais",
  exam_feminino: "exames_laboratoriais",
  exam_adulto: "exames_laboratoriais",
  exam_gestante: "exames_laboratoriais",
  exam_gestante_mono: "exames_laboratoriais",
  exam_gestante_gem: "exames_laboratoriais",
  composition: "exames_laboratoriais",
  metabolism: "exames_laboratoriais",
  genetics: "exames_laboratoriais",

  // Conversa geral / raciocínio clínico
  reasoning: "conversa_geral",
  conversa_geral: "conversa_geral",

  // Plano alimentar / produção
  production: "plano_alimentar",
  plano_alimentar: "plano_alimentar",

  // Pesquisa científica (RAG)
  research: "artigos_cientificos",
  artigos_cientificos: "artigos_cientificos",

  // Suplementação e formulação magistral (uso futuro / cards específicos)
  suplementacao: "suplementacao",
  formulacao_magistral: "formulacao_magistral",
};

export function resolveAgentKey(agentType: string | undefined | null): string | null {
  if (!agentType) return null;
  return MAP[agentType] ?? null;
}
