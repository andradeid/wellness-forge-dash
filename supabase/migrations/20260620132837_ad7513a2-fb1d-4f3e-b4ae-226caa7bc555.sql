-- Remove a antiga unique constraint (user_id sozinho) se existir
ALTER TABLE public.user_sessions DROP CONSTRAINT IF EXISTS user_sessions_user_id_key;
ALTER TABLE public.user_sessions DROP CONSTRAINT IF EXISTS user_sessions_user_id_unique;

-- Garante unique composta para suportar onConflict user_id,active_session_token
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_sessions_user_token_unique'
  ) THEN
    ALTER TABLE public.user_sessions
      ADD CONSTRAINT user_sessions_user_token_unique UNIQUE (user_id, active_session_token);
  END IF;
END $$;