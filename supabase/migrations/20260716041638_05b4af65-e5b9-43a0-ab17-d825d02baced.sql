
-- 1) integrations: remover leitura ampla; apenas super_admin lê. Servidor usa service_role (bypass RLS).
DROP POLICY IF EXISTS "Users can read Dify configuration" ON public.integrations;

-- Garantir política de leitura super_admin (o "manage" já cobria, mas explicito para clareza)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'public.integrations'::regclass
      AND polname = 'Super admin reads integrations'
  ) THEN
    CREATE POLICY "Super admin reads integrations"
      ON public.integrations FOR SELECT
      TO authenticated
      USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));
  END IF;
END$$;

-- 2) dify_agents: revogar acesso às colunas sensíveis para authenticated.
-- Mantém SELECT nas colunas necessárias ao front (agent_id, label, is_active, etc.).
REVOKE SELECT ON public.dify_agents FROM authenticated;
GRANT SELECT (
  id, agent_id, label, description, is_active, sort_order,
  card_trigger, patient_required, is_super_agent, created_at, updated_at
) ON public.dify_agents TO authenticated;
-- api_key e endpoint permanecem sem GRANT para authenticated; service_role mantém acesso total.
GRANT ALL ON public.dify_agents TO service_role;

-- 3) agent_costs: expor apenas colunas necessárias à UI de créditos para authenticated.
-- Admins seguem lendo tudo pela policy "Admins manage agent costs".
REVOKE SELECT ON public.agent_costs FROM authenticated;
GRANT SELECT (
  id, agent_key, display_name, cost_credits, is_active, created_at, updated_at
) ON public.agent_costs TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.agent_costs TO authenticated; -- policy "Admins manage" restringe por role
GRANT ALL ON public.agent_costs TO service_role;

-- 4) Formaliza reads admin-only nas tabelas de operação (mesmo que hoje já bloqueadas por não terem policy permissiva)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'public.integration_logs'::regclass
      AND polname = 'Admins read integration logs'
  ) THEN
    CREATE POLICY "Admins read integration logs"
      ON public.integration_logs FOR SELECT
      TO authenticated
      USING (
        public.has_role(auth.uid(), 'super_admin'::public.app_role)
        OR public.has_role(auth.uid(), 'admin'::public.app_role)
      );
  END IF;
END$$;

-- 5) super_agent_cards / super_agent_tasks: mantém leitura de itens ativos para autenticados
--    (necessário para renderizar tarefas no chat), mas garante que admin/super_admin veja inativos também.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'public.super_agent_cards'::regclass
      AND polname = 'Admins read all super_agent_cards'
  ) THEN
    CREATE POLICY "Admins read all super_agent_cards"
      ON public.super_agent_cards FOR SELECT
      TO authenticated
      USING (
        public.has_role(auth.uid(), 'super_admin'::public.app_role)
        OR public.has_role(auth.uid(), 'admin'::public.app_role)
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'public.super_agent_tasks'::regclass
      AND polname = 'Admins read all super_agent_tasks'
  ) THEN
    CREATE POLICY "Admins read all super_agent_tasks"
      ON public.super_agent_tasks FOR SELECT
      TO authenticated
      USING (
        public.has_role(auth.uid(), 'super_admin'::public.app_role)
        OR public.has_role(auth.uid(), 'admin'::public.app_role)
      );
  END IF;
END$$;
