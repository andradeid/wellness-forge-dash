CREATE OR REPLACE FUNCTION public.try_acquire_stream_slot(p_user_id uuid, p_agent_type text, p_max_per_minute integer DEFAULT 10)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_recent_count int;
  v_oldest_in_window timestamptz;
  v_retry_after int;
BEGIN
  -- 1) Limpeza oportunista de órfãos (>2min)
  DELETE FROM public.active_streams
   WHERE started_at < now() - interval '2 minutes';

  -- 2) Limpeza de hits antigos (>2min)
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
$function$;