-- Permite múltiplos cards compartilharem o mesmo card_trigger em super_agent_cards.
-- Necessário para o card "Análise Completa" que roteia por perfil (4 super agentes → 1 trigger).
-- Isso já é o comportamento em dify_agents (4 exames laboratoriais compartilham 'exames_de_sangue').
-- A unicidade cross-table permanece garantida pelo trigger validate_card_trigger_uniqueness.

DROP INDEX IF EXISTS public.idx_super_agent_cards_trigger_unique;

CREATE INDEX IF NOT EXISTS idx_super_agent_cards_trigger
  ON public.super_agent_cards (card_trigger)
  WHERE card_trigger IS NOT NULL;