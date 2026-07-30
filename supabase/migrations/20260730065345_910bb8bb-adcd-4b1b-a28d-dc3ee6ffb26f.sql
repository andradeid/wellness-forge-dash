DO $$
DECLARE v_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data, confirmation_token, recovery_token,
    email_change_token_new, email_change
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
    'curadoria@lumma.ia.br', crypt('102030', gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Curadoria Lumma"}'::jsonb, '', '', '', ''
  );

  INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  VALUES (gen_random_uuid(), v_id, v_id::text,
    jsonb_build_object('sub', v_id::text, 'email', 'curadoria@lumma.ia.br', 'email_verified', true, 'phone_verified', false),
    'email', now(), now(), now());

  INSERT INTO public.profiles (id, full_name, email)
  VALUES (v_id, 'Curadoria Lumma', 'curadoria@lumma.ia.br')
  ON CONFLICT (id) DO NOTHING;

  DELETE FROM public.user_roles WHERE user_id = v_id;
  INSERT INTO public.user_roles (user_id, role) VALUES (v_id, 'curator');
END $$;