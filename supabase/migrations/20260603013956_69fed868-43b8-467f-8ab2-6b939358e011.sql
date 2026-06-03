GRANT SELECT ON public.dify_agents TO authenticated;

CREATE POLICY "Authenticated reads active dify_agents"
ON public.dify_agents
FOR SELECT
TO authenticated
USING (is_active = true);