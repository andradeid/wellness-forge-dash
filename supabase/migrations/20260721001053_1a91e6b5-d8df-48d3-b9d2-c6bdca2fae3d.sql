
REVOKE SELECT (api_key) ON public.dify_agents FROM authenticated;

DROP VIEW IF EXISTS public.dify_agents_public;
CREATE VIEW public.dify_agents_public
WITH (security_invoker = true) AS
SELECT id, agent_id, label, description, endpoint, card_trigger,
       patient_required, is_active, is_super_agent, sort_order,
       (api_key IS NOT NULL AND length(btrim(api_key)) > 0) AS has_api_key,
       created_at, updated_at
FROM public.dify_agents;

GRANT SELECT ON public.dify_agents_public TO authenticated, anon;
