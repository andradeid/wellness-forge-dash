DROP POLICY IF EXISTS "authenticated read user_tags" ON public.user_tags;
CREATE POLICY "staff read user_tags" ON public.user_tags FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'super_admin'::app_role) OR public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'support'::app_role));