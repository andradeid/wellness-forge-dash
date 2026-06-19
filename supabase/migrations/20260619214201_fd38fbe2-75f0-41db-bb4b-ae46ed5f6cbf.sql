-- 1) max_seats em subscription_plans
ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS max_seats INTEGER NOT NULL DEFAULT 1;

UPDATE public.subscription_plans SET max_seats = 1 WHERE slug = 'starter';
UPDATE public.subscription_plans SET max_seats = 2 WHERE slug = 'pro';
UPDATE public.subscription_plans SET max_seats = 5 WHERE slug = 'clinica';

-- 2) user_sessions: múltiplos registros por user_id
ALTER TABLE public.user_sessions DROP CONSTRAINT IF EXISTS user_sessions_pkey;

ALTER TABLE public.user_sessions
  ADD COLUMN IF NOT EXISTS id UUID NOT NULL DEFAULT gen_random_uuid();

ALTER TABLE public.user_sessions
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE public.user_sessions ADD PRIMARY KEY (id);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_sessions_user_token_unique'
  ) THEN
    ALTER TABLE public.user_sessions
      ADD CONSTRAINT user_sessions_user_token_unique UNIQUE (user_id, active_session_token);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS user_sessions_user_id_idx ON public.user_sessions(user_id);
CREATE INDEX IF NOT EXISTS user_sessions_user_updated_idx ON public.user_sessions(user_id, updated_at);