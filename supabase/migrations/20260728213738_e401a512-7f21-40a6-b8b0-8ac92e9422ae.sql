
UPDATE auth.users
SET email = 'projetolumma@gmail.com',
    email_confirmed_at = COALESCE(email_confirmed_at, now()),
    updated_at = now()
WHERE id = 'a51c0d8e-10a2-4d46-bd44-eb203c7a291b';

UPDATE public.profiles
SET email = 'projetolumma@gmail.com', updated_at = now()
WHERE id = 'a51c0d8e-10a2-4d46-bd44-eb203c7a291b';

INSERT INTO public.integration_logs (source, event, status, message, payload)
VALUES ('admin-users','email_change','success','Troca manual de e-mail',
  jsonb_build_object('user_id','a51c0d8e-10a2-4d46-bd44-eb203c7a291b','from','andradeid@gmail.com','to','projetolumma@gmail.com'));
