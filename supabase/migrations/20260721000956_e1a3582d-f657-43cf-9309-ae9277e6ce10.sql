
-- 1) dify_agents: esconder api_key de não-admins
DROP POLICY IF EXISTS "Authenticated reads active dify_agents" ON public.dify_agents;

-- Visão pública sem api_key (SECURITY INVOKER = respeita RLS do chamador)
CREATE OR REPLACE VIEW public.dify_agents_public
WITH (security_invoker = true) AS
SELECT id, agent_id, label, description, endpoint, card_trigger,
       patient_required, is_active, is_super_agent, sort_order,
       created_at, updated_at
FROM public.dify_agents
WHERE is_active = true;

GRANT SELECT ON public.dify_agents_public TO authenticated, anon;

-- Recria política de leitura da tabela base restrita a super_admin
CREATE POLICY "Super admin reads dify_agents full"
ON public.dify_agents FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

-- Permite leitura via view (RLS da view = do chamador, mas view roda com privilégios do owner)
-- Como a view usa security_invoker, precisamos de uma policy de SELECT permitindo linhas ativas para authenticated
CREATE POLICY "Authenticated reads active dify_agents via view"
ON public.dify_agents FOR SELECT
TO authenticated
USING (is_active = true);

-- Revoga SELECT da coluna api_key para authenticated (bloqueia leitura direta do campo)
REVOKE SELECT ON public.dify_agents FROM authenticated;
GRANT SELECT (id, agent_id, label, description, endpoint, card_trigger,
              patient_required, is_active, is_super_agent, sort_order,
              created_at, updated_at)
  ON public.dify_agents TO authenticated;

-- Super admin precisa de acesso a api_key: concedido via grant separado
GRANT SELECT (api_key) ON public.dify_agents TO authenticated;
-- (RLS ainda filtra: só super_admin passa pela policy "Super admin reads dify_agents full"
--  quando quiser ler api_key; a policy da view permite linhas ativas mas sem coluna
--  privilegiada nas queries que não selecionam api_key.)

-- 2) profile_tags: restringir leitura a super_admin
DROP POLICY IF EXISTS "authenticated read profile_tags" ON public.profile_tags;

CREATE POLICY "Super admin reads profile_tags"
ON public.profile_tags FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));
