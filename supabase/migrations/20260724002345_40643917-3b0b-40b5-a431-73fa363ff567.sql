
-- profiles: permitir SELECT para support
DROP POLICY IF EXISTS "Support views profiles" ON public.profiles;
CREATE POLICY "Support views profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'support'::app_role));

-- subscriptions: permitir SELECT para support
DROP POLICY IF EXISTS "Support views subscriptions" ON public.subscriptions;
CREATE POLICY "Support views subscriptions"
  ON public.subscriptions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'support'::app_role));

-- user_roles: permitir SELECT para support (necessário pra listar nutris)
DROP POLICY IF EXISTS "Support views user_roles" ON public.user_roles;
CREATE POLICY "Support views user_roles"
  ON public.user_roles FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'support'::app_role));
