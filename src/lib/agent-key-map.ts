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

  // Análise/geração visual (visão computacional + geração de imagem)
  estimativa_refeicao_foto: "analise_visual",
  composicao_corporal_foto: "analise_visual",
  nutricao_visual: "geracao_visual",
  analise_visual: "analise_visual",
  geracao_visual: "geracao_visual",
};

/**
 * Super Agentes: mapeia o `task_key` (identificador global da tarefa
 * interna executada) → `agent_key` da tabela `agent_costs`.
 *
 * O custo é POR TAREFA, GLOBAL: rodar `composition` custa o mesmo
 * independente de qual super agente/perfil executou. Se quiser variar
 * o preço por task_key, cadastre uma linha em `agent_costs` com
 * `agent_key = task_key` e aponte aqui direto.
 */
const MAP_TASK: Record<string, string> = {
  composition: "exames_laboratoriais",
  metabolism: "exames_laboratoriais",
  genetics: "exames_laboratoriais",
  exam: "exames_laboratoriais",
  reasoning: "conversa_geral",
  production: "plano_alimentar",
  research: "artigos_cientificos",
  suplementacao: "suplementacao",
  formulacao_magistral: "formulacao_magistral",
  estimativa_refeicao_foto: "analise_visual",
  composicao_corporal_foto: "analise_visual",
};

export interface ResolveAgentKeyOptions {
  isSuperAgent?: boolean;
  selectedTask?: string | null;
}

export function resolveAgentKey(
  agentType: string | undefined | null,
  opts?: ResolveAgentKeyOptions,
): string | null {
  if (opts?.isSuperAgent && opts.selectedTask) {
    return MAP_TASK[opts.selectedTask] ?? null;
  }
  if (!agentType) return null;
  return MAP[agentType] ?? null;
}
