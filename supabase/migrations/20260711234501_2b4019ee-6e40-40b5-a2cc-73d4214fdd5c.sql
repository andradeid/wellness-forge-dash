
-- 1) dify_agents: flag de super agente
ALTER TABLE public.dify_agents
  ADD COLUMN IF NOT EXISTS is_super_agent BOOLEAN NOT NULL DEFAULT false;

-- 2) super_agent_tasks
CREATE TABLE public.super_agent_tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES public.dify_agents(agent_id) ON DELETE CASCADE ON UPDATE CASCADE,
  task_key TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT super_agent_tasks_agent_task_unique UNIQUE (agent_id, task_key),
  CONSTRAINT super_agent_tasks_task_key_format CHECK (task_key ~ '^[a-z0-9_]+$')
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.super_agent_tasks TO authenticated;
GRANT ALL ON public.super_agent_tasks TO service_role;

ALTER TABLE public.super_agent_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated reads active super_agent_tasks"
  ON public.super_agent_tasks FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE POLICY "Super admin manages super_agent_tasks"
  ON public.super_agent_tasks FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE INDEX idx_super_agent_tasks_agent_id ON public.super_agent_tasks(agent_id);

CREATE TRIGGER update_super_agent_tasks_updated_at
  BEFORE UPDATE ON public.super_agent_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) super_agent_cards
CREATE TABLE public.super_agent_cards (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES public.super_agent_tasks(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  icon TEXT,
  card_trigger TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.super_agent_cards TO authenticated;
GRANT ALL ON public.super_agent_cards TO service_role;

ALTER TABLE public.super_agent_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated reads active super_agent_cards"
  ON public.super_agent_cards FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE POLICY "Super admin manages super_agent_cards"
  ON public.super_agent_cards FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE INDEX idx_super_agent_cards_task_id ON public.super_agent_cards(task_id);
CREATE UNIQUE INDEX idx_super_agent_cards_trigger_unique
  ON public.super_agent_cards(card_trigger)
  WHERE card_trigger IS NOT NULL;

CREATE TRIGGER update_super_agent_cards_updated_at
  BEFORE UPDATE ON public.super_agent_cards
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4) chat_messages.selected_task
ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS selected_task TEXT;

-- 5) Validação anti-duplicata cross-tabela para card_trigger
CREATE OR REPLACE FUNCTION public.validate_card_trigger_uniqueness()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.card_trigger IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'dify_agents' THEN
    IF EXISTS (
      SELECT 1 FROM public.super_agent_cards
      WHERE card_trigger = NEW.card_trigger
    ) THEN
      RAISE EXCEPTION 'card_trigger "%" já está em uso em super_agent_cards', NEW.card_trigger
        USING ERRCODE = 'unique_violation';
    END IF;
  ELSIF TG_TABLE_NAME = 'super_agent_cards' THEN
    IF EXISTS (
      SELECT 1 FROM public.dify_agents
      WHERE card_trigger = NEW.card_trigger
    ) THEN
      RAISE EXCEPTION 'card_trigger "%" já está em uso em dify_agents', NEW.card_trigger
        USING ERRCODE = 'unique_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER dify_agents_card_trigger_unique
  BEFORE INSERT OR UPDATE OF card_trigger ON public.dify_agents
  FOR EACH ROW EXECUTE FUNCTION public.validate_card_trigger_uniqueness();

CREATE TRIGGER super_agent_cards_card_trigger_unique
  BEFORE INSERT OR UPDATE OF card_trigger ON public.super_agent_cards
  FOR EACH ROW EXECUTE FUNCTION public.validate_card_trigger_uniqueness();
