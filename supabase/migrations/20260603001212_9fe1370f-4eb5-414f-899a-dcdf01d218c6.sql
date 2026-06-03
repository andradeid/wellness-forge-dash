-- 1) Tabela
CREATE TABLE public.dify_agents (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id     TEXT        UNIQUE NOT NULL,
  label        TEXT        NOT NULL,
  description  TEXT,
  api_key      TEXT,
  endpoint     TEXT        NOT NULL DEFAULT 'https://api.dify.ai/v1',
  is_active    BOOLEAN     NOT NULL DEFAULT true,
  sort_order   INTEGER     NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2) Grants (auth-only; service_role para server fns)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dify_agents TO authenticated;
GRANT ALL ON public.dify_agents TO service_role;

-- 3) RLS
ALTER TABLE public.dify_agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin manages dify_agents"
ON public.dify_agents
FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

-- 4) Trigger updated_at
CREATE TRIGGER update_dify_agents_updated_at
BEFORE UPDATE ON public.dify_agents
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- 5) Dados iniciais
INSERT INTO public.dify_agents (agent_id, label, description, sort_order) VALUES
  ('exam',       'App de Exames',     'Interpretação de laudos laboratoriais',     1),
  ('production', 'App de Produção',   'Plano alimentar, receitas e formulações',   2),
  ('research',   'App de Pesquisa',   'Resumo e busca de artigos científicos',     3),
  ('reasoning',  'App de Raciocínio', 'Perguntas clínicas e raciocínio de caso',   4);
