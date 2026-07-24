
DO $$
DECLARE
  v_user_id UUID;
  v_email TEXT;
  v_password TEXT;
  v_name TEXT;
  v_users JSONB := '[
    {"email":"yuri@grupoetria.com","password":"Yuri@Lumma2026!k3n8","name":"Yuri"},
    {"email":"samara@grupoetria.com","password":"Samara@Lumma2026!p7m2","name":"Samara"},
    {"email":"jaqueline@grupoetria.com","password":"Jaque@Lumma2026!r5x9","name":"Jaqueline"},
    {"email":"operacoes@grupoetria.com","password":"Opera@Lumma2026!t4h6","name":"Operacoes"}
  ]'::jsonb;
  v_item JSONB;
BEGIN
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_users) LOOP
    v_email := v_item->>'email';
    v_password := v_item->>'password';
    v_name := v_item->>'name';

    IF EXISTS (SELECT 1 FROM auth.users WHERE email = v_email) THEN
      -- já existe: só garante support + must_change
      SELECT id INTO v_user_id FROM auth.users WHERE email = v_email;
      UPDATE auth.users
        SET encrypted_password = crypt(v_password, gen_salt('bf')),
            email_confirmed_at = COALESCE(email_confirmed_at, now()),
            updated_at = now()
        WHERE id = v_user_id;
    ELSE
      v_user_id := gen_random_uuid();

      INSERT INTO auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at,
        confirmation_token, email_change, email_change_token_new, recovery_token
      ) VALUES (
        '00000000-0000-0000-0000-000000000000',
        v_user_id,
        'authenticated', 'authenticated',
        v_email,
        crypt(v_password, gen_salt('bf')),
        now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('full_name', v_name, 'name', v_name),
        now(), now(),
        '', '', '', ''
      );

      INSERT INTO auth.identities (
        id, user_id, provider_id, identity_data, provider,
        last_sign_in_at, created_at, updated_at
      ) VALUES (
        gen_random_uuid(),
        v_user_id,
        v_user_id::text,
        jsonb_build_object('sub', v_user_id::text, 'email', v_email),
        'email',
        now(), now(), now()
      );
    END IF;

    -- garante profile
    INSERT INTO public.profiles (id, full_name, email)
      VALUES (v_user_id, v_name, v_email)
      ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, email = EXCLUDED.email;

    -- força troca de senha no primeiro login
    UPDATE public.profiles SET must_change_password = true WHERE id = v_user_id;

    -- remove roles antigas e aplica support
    DELETE FROM public.user_roles WHERE user_id = v_user_id;
    INSERT INTO public.user_roles (user_id, role) VALUES (v_user_id, 'support');

    -- remove subscription (CS não usa créditos/plano)
    DELETE FROM public.subscriptions WHERE user_id = v_user_id;
    DELETE FROM public.user_credits WHERE user_id = v_user_id;
  END LOOP;
END $$;
