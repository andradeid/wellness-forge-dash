
UPDATE auth.users SET email_confirmed_at = now()
WHERE email = 'marcos@setupdigital.com.br' AND email_confirmed_at IS NULL;

DELETE FROM public.user_roles
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'marcos@setupdigital.com.br')
  AND role = 'nutri';

INSERT INTO public.user_roles (user_id, role)
SELECT id, 'super_admin'::public.app_role FROM auth.users
WHERE email = 'marcos@setupdigital.com.br'
ON CONFLICT (user_id, role) DO NOTHING;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE assigned_role public.app_role;
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name', ''), NEW.email);
  IF NEW.email IN ('marcos@setupdigital.com.br', 'marcos@marcosandrade.me') THEN
    assigned_role := 'super_admin';
  ELSE
    assigned_role := 'nutri';
  END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, assigned_role);
  INSERT INTO public.subscriptions (user_id, status, plan_type) VALUES (NEW.id, 'trial', 'free');
  RETURN NEW;
END;
$function$;
