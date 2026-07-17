import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface DifyAgentConfig {
  id: string;
  agent_id: string;
  label: string;
  card_trigger: string | null;
  patient_required: boolean;
  is_active: boolean;
  is_super_agent: boolean;
}

export interface SuperAgentTask {
  id: string;
  agent_id: string;
  task_key: string;
  label: string;
  description: string | null;
  icon: string | null;
  is_active: boolean;
  sort_order: number;
}

export interface SuperAgentCard {
  id: string;
  task_id: string;
  label: string;
  icon: string | null;
  card_trigger: string | null;
  is_active: boolean;
  sort_order: number;
}

export function useAgentConfig() {
  const [agents, setAgents] = useState<DifyAgentConfig[]>([]);
  const [tasks, setTasks] = useState<SuperAgentTask[]>([]);
  const [cards, setCards] = useState<SuperAgentCard[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAgents = useCallback(async () => {
    setLoading(true);
    const [agentsRes, tasksRes, cardsRes] = await Promise.all([
      supabase
        .from("dify_agents")
        .select("id, agent_id, label, card_trigger, patient_required, is_active, is_super_agent")
        .eq("is_active", true),
      supabase
        .from("super_agent_tasks" as any)
        .select("id, agent_id, task_key, label, description, icon, is_active, sort_order")
        .eq("is_active", true),
      supabase
        .from("super_agent_cards" as any)
        .select("id, task_id, label, icon, card_trigger, is_active, sort_order")
        .eq("is_active", true),
    ]);

    if (!agentsRes.error && agentsRes.data) {
      setAgents(agentsRes.data as DifyAgentConfig[]);
    }
    if (!tasksRes.error && tasksRes.data) {
      setTasks(tasksRes.data as unknown as SuperAgentTask[]);
    }
    if (!cardsRes.error && cardsRes.data) {
      setCards(cardsRes.data as unknown as SuperAgentCard[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadAgents();
  }, [loadAgents]);

  const getAgentsForCard = useCallback((cardTrigger: string) => {
    return agents.filter(a => a.card_trigger === cardTrigger);
  }, [agents]);

  const getAgentForCard = useCallback((cardTrigger: string, patientProfile?: string, pregnancyType?: string) => {
    const matchingAgents = getAgentsForCard(cardTrigger);
    
    if (matchingAgents.length === 0) return null;
    
    // Special case: exames_de_sangue
    // SEGURANÇA CLÍNICA: NUNCA caímos em fallback silencioso para o agente masculino.
    // Se o perfil não estiver definido, retornamos null para forçar o usuário a confirmar
    // o perfil antes que o exame seja roteado (evita receitar ativos teratogênicos
    // a gestantes, p.ex.).
    if (cardTrigger === 'exames_de_sangue') {
      if (patientProfile === 'adulto_masculino') {
        return matchingAgents.find(a => a.agent_id === 'exam_masculino') || null;
      }

      if (patientProfile === 'adulto_feminino') {
        return matchingAgents.find(a => a.agent_id === 'exam_feminino') || null;
      }

      if (patientProfile === 'gestante') {
        const isGemelar = pregnancyType === 'gemelar' || pregnancyType === 'Gemelar' || pregnancyType === 'multiple';
        if (isGemelar) {
          return matchingAgents.find(a => a.agent_id === 'exam_gestante_gem') || null;
        }
        return matchingAgents.find(a => a.agent_id === 'exam_gestante_mono') || null;
      }

      // Perfil desconhecido em exames_de_sangue: BLOQUEIA. Quem chamou deve avisar o usuário.
      return null;
    }

    return matchingAgents[0];
  }, [getAgentsForCard]);

  const requiresPatient = useCallback((agentId: string) => {
    const agent = agents.find(a => a.agent_id === agentId);
    return agent ? agent.patient_required : true;
  }, [agents]);

  // ── Super Agentes ──────────────────────────────────────────────────────
  const isSuperAgent = useCallback((agentId: string) => {
    const agent = agents.find(a => a.agent_id === agentId);
    return agent?.is_super_agent === true;
  }, [agents]);

  const getSuperAgentTasks = useCallback((agentId: string) => {
    return tasks
      .filter(t => t.agent_id === agentId)
      .sort((a, b) => a.sort_order - b.sort_order);
  }, [tasks]);

  const getSuperAgentCards = useCallback((agentId: string) => {
    const taskIds = new Set(tasks.filter(t => t.agent_id === agentId).map(t => t.id));
    return cards
      .filter(c => taskIds.has(c.task_id))
      .sort((a, b) => a.sort_order - b.sort_order);
  }, [tasks, cards]);

  /** Dado um card_trigger, resolve a task correspondente (agent_id + task_key). */
  const resolveCardToTask = useCallback((cardTrigger: string): { agentId: string; taskKey: string } | null => {
    const card = cards.find(c => c.card_trigger === cardTrigger);
    if (!card) return null;
    const task = tasks.find(t => t.id === card.task_id);
    if (!task) return null;
    return { agentId: task.agent_id, taskKey: task.task_key };
  }, [tasks, cards]);

  /**
   * Roteia o card "Análise Completa" para o Super Agente correto (agent_id + task_key)
   * conforme o perfil clínico da paciente.
   *
   * SEGURANÇA CLÍNICA: Sem perfil definido (ou gestante sem pregnancy_type),
   * devolve `null` — o call site deve bloquear e pedir para completar o cadastro.
   *
   * Mapeamento:
   *  - adulto_masculino  → super_masculino
   *  - adulto_feminino   → super_feminino
   *  - gestante+single   → super_gestante_mono
   *  - gestante+multiple → super_gestante_gemelar
   */
  const resolveAnaliseCompleta = useCallback((
    patientProfile?: string,
    pregnancyType?: string,
  ): { agentId: string; taskKey: string } | null => {
    let targetAgent: string | null = null;
    if (patientProfile === 'adulto_masculino') {
      targetAgent = 'super_masculino';
    } else if (patientProfile === 'adulto_feminino') {
      targetAgent = 'super_feminino';
    } else if (patientProfile === 'gestante') {
      if (pregnancyType === 'multiple') targetAgent = 'super_gestante_gemelar';
      else if (pregnancyType === 'single') targetAgent = 'super_gestante_mono';
      else return null;
    } else {
      return null;
    }
    const agentTaskIds = new Set(tasks.filter(t => t.agent_id === targetAgent).map(t => t.id));
    const card = cards.find(c => c.card_trigger === 'analise_completa' && agentTaskIds.has(c.task_id));
    if (!card) return null;
    const task = tasks.find(t => t.id === card.task_id);
    if (!task) return null;
    return { agentId: task.agent_id, taskKey: task.task_key };
  }, [tasks, cards]);

  /**
   * Roteamento genérico: card_trigger → super agente por perfil + task_key.
   * Espelha `resolveAnaliseCompleta` mas para os demais cards clínicos que
   * também devem rodar via super agente com a task específica do card.
   *
   * Mapeamento card_trigger → task_key (task global do super agente):
   *  - exames_de_sangue      → exam_masc | exam_fem | exam_gest_mono | exam_gest_gem (por perfil)
   *  - composicao_metabolismo → composition
   *  - genetica_microbioma   → genetics
   *  - estimativa_refeicao_foto → estimativa_refeicao_foto
   *  - composicao_corporal_foto → composicao_corporal_foto
   *  - casos_clinicos        → reasoning
   *  - plano_alimentar       → production
   *
   * Retorna `null` quando perfil/pregnancy_type estão incompletos — o call
   * site deve pedir para completar o cadastro (SEGURANÇA CLÍNICA).
   */
  const resolveSuperByProfile = useCallback((
    cardTrigger: string,
    patientProfile?: string,
    pregnancyType?: string,
  ): { agentId: string; taskKey: string } | null => {
    // 1) super agente por perfil
    let agentId: string | null = null;
    if (patientProfile === 'adulto_masculino') agentId = 'super_masculino';
    else if (patientProfile === 'adulto_feminino') agentId = 'super_feminino';
    else if (patientProfile === 'gestante') {
      if (pregnancyType === 'multiple') agentId = 'super_gestante_gemelar';
      else if (pregnancyType === 'single') agentId = 'super_gestante_mono';
      else return null;
    } else {
      return null;
    }

    // 2) task_key por card_trigger
    let taskKey: string | null = null;
    switch (cardTrigger) {
      case 'exames_de_sangue':
        taskKey = agentId === 'super_masculino' ? 'exam_masc'
          : agentId === 'super_feminino' ? 'exam_fem'
          : agentId === 'super_gestante_mono' ? 'exam_gest_mono'
          : agentId === 'super_gestante_gemelar' ? 'exam_gest_gem'
          : null;
        break;
      case 'composicao_metabolismo': taskKey = 'composition'; break;
      case 'genetica_microbioma': taskKey = 'genetics'; break;
      case 'estimativa_refeicao_foto': taskKey = 'estimativa_refeicao_foto'; break;
      case 'composicao_corporal_foto': taskKey = 'composicao_corporal_foto'; break;
      case 'casos_clinicos': taskKey = 'reasoning'; break;
      case 'plano_alimentar': taskKey = 'production'; break;
      default: return null;
    }
    if (!taskKey) return null;

    // 3) valida que a task existe e o super agente está ativo
    const agentActive = agents.some(a => a.agent_id === agentId && a.is_super_agent && a.is_active);
    const taskActive = tasks.some(t => t.agent_id === agentId && t.task_key === taskKey && t.is_active);
    if (!agentActive || !taskActive) return null;

    return { agentId, taskKey };
  }, [agents, tasks]);




  /**
   * Verifica se um card_trigger já existe em dify_agents ou super_agent_cards.
   * Usado pelo painel admin para bloquear duplicatas antes de salvar.
   */
  const checkCardTriggerAvailable = useCallback(async (
    cardTrigger: string,
    exclude?: { table: "dify_agents" | "super_agent_cards"; id: string },
  ): Promise<{ available: boolean; conflictIn?: "dify_agents" | "super_agent_cards"; conflictLabel?: string }> => {
    const trigger = cardTrigger.trim();
    if (!trigger) return { available: true };

    const agentsQ = supabase
      .from("dify_agents")
      .select("id, label")
      .eq("card_trigger", trigger);
    const cardsQ = supabase
      .from("super_agent_cards" as any)
      .select("id, label")
      .eq("card_trigger", trigger);

    const [agentsRes, cardsRes] = await Promise.all([agentsQ, cardsQ]);

    const agentHit = (agentsRes.data ?? []).find((r: any) => !(exclude?.table === "dify_agents" && r.id === exclude.id));
    if (agentHit) {
      return { available: false, conflictIn: "dify_agents", conflictLabel: (agentHit as any).label };
    }
    const cardHit = (cardsRes.data ?? []).find((r: any) => !(exclude?.table === "super_agent_cards" && r.id === exclude.id));
    if (cardHit) {
      return { available: false, conflictIn: "super_agent_cards", conflictLabel: (cardHit as any).label };
    }
    return { available: true };
  }, []);

  return {
    agents,
    tasks,
    cards,
    loading,
    getAgentsForCard,
    getAgentForCard,
    requiresPatient,
    isSuperAgent,
    getSuperAgentTasks,
    getSuperAgentCards,
    resolveCardToTask,
    resolveAnaliseCompleta,
    checkCardTriggerAvailable,
    refresh: loadAgents,
  };
}
