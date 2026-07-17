
-- ============================================================
-- active_streams: 1 registro por usuário com stream em andamento
-- ============================================================
CREATE TABLE public.active_streams (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  agent_type text
);

GRANT ALL ON public.active_streams TO service_role;

ALTER TABLE public.active_streams ENABLE ROW LEVEL SECURITY;

-- Sem policies: apenas service_role (via proxy) acessa. Nutricionistas nunca leem/escrevem direto.

-- ============================================================
-- rate_limit_hits: log de envios pra contar janela de 1 minuto
-- ============================================================
CREATE TABLE public.rate_limit_hits (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hit_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_rate_limit_hits_user_time
  ON public.rate_limit_hits (user_id, hit_at DESC);

GRANT ALL ON public.rate_limit_hits TO service_role;

ALTER TABLE public.rate_limit_hits ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- try_acquire_stream_slot: atômico — checa limite/min E reserva slot
-- Retorna: { ok: bool, reason: 'concurrent' | 'rate' | null, retry_after_s: int | null }
-- ============================================================
CREATE OR REPLACE FUNCTION public.try_acquire_stream_slot(
  p_user_id uuid,
  p_agent_type text,
  p_max_per_minute int DEFAULT 10
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recent_count int;
  v_oldest_in_window timestamptz;
  v_retry_after int;
BEGIN
  -- 1) Limpeza oportunista de órfãos (>10min) — barata, roda a cada request
  DELETE FROM public.active_streams
   WHERE started_at < now() - interval '10 minutes';

  -- 2) Limpeza de hits antigos (>2min) — evita a tabela crescer sem controle
  DELETE FROM public.rate_limit_hits
   WHERE hit_at < now() - interval '2 minutes';

  -- 3) Rate limit por minuto
  SELECT count(*), min(hit_at)
    INTO v_recent_count, v_oldest_in_window
    FROM public.rate_limit_hits
   WHERE user_id = p_user_id
     AND hit_at > now() - interval '1 minute';

  IF v_recent_count >= p_max_per_minute THEN
    v_retry_after := GREATEST(1, EXTRACT(EPOCH FROM (v_oldest_in_window + interval '1 minute' - now()))::int);
    RETURN jsonb_build_object('ok', false, 'reason', 'rate', 'retry_after_s', v_retry_after);
  END IF;

  -- 4) Tenta reservar slot (1 stream ativo por usuário via PK)
  BEGIN
    INSERT INTO public.active_streams (user_id, agent_type)
      VALUES (p_user_id, p_agent_type);
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'concurrent', 'retry_after_s', null);
  END;

  -- 5) Registra o hit (só depois de garantir o slot)
  INSERT INTO public.rate_limit_hits (user_id) VALUES (p_user_id);

  RETURN jsonb_build_object('ok', true, 'reason', null, 'retry_after_s', null);
END;
$$;

-- Só service_role executa (proxy chama com service key)
REVOKE ALL ON FUNCTION public.try_acquire_stream_slot(uuid, text, int) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.try_acquire_stream_slot(uuid, text, int) TO service_role;

-- ============================================================
-- release_stream_slot: libera o slot no finally do proxy
-- ============================================================
CREATE OR REPLACE FUNCTION public.release_stream_slot(p_user_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.active_streams WHERE user_id = p_user_id;
$$;

REVOKE ALL ON FUNCTION public.release_stream_slot(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_stream_slot(uuid) TO service_role;
