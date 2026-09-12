REVOKE ALL ON TABLE public.dify_agents FROM anon;
REVOKE ALL ON TABLE public.dify_agents_public FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.dify_agents FROM authenticated;
GRANT SELECT (id, agent_id, label, description, endpoint, is_active, sort_order, created_at, updated_at, card_trigger, patient_required, is_super_agent) ON public.dify_agents TO authenticated;
GRANT ALL ON TABLE public.dify_agents TO service_role;