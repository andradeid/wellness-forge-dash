import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface DifyAgentConfig {
  id: string;
  agent_id: string;
  label: string;
  card_trigger: string | null;
  patient_required: boolean;
  is_active: boolean;
}

export function useAgentConfig() {
  const [agents, setAgents] = useState<DifyAgentConfig[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAgents = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("dify_agents")
      .select("id, agent_id, label, card_trigger, patient_required, is_active")
      .eq("is_active", true);

    if (!error && data) {
      setAgents(data as DifyAgentConfig[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadAgents();
  }, [loadAgents]);

  const getAgentsForCard = useCallback((cardTrigger: string) => {
    return agents.filter(a => a.card_trigger === cardTrigger);
  }, [agents]);

  const getAgentForCard = useCallback((cardTrigger: string, patientProfile?: string) => {
    const matchingAgents = getAgentsForCard(cardTrigger);
    
    if (matchingAgents.length === 0) return null;
    
    // Special case: exames_de_sangue
    if (cardTrigger === 'exames_de_sangue' && patientProfile) {
      if (patientProfile === 'gestante') {
        return matchingAgents.find(a => a.agent_id === 'exam_gestante') || matchingAgents[0];
      } else {
        return matchingAgents.find(a => a.agent_id === 'exam_adulto') || matchingAgents[0];
      }
    }

    return matchingAgents[0];
  }, [getAgentsForCard]);

  const requiresPatient = useCallback((agentId: string) => {
    const agent = agents.find(a => a.agent_id === agentId);
    return agent ? agent.patient_required : true;
  }, [agents]);

  return {
    agents,
    loading,
    getAgentsForCard,
    getAgentForCard,
    requiresPatient,
    refresh: loadAgents
  };
}
