
-- 1) Coluna ilimitado em subscriptions
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS unlimited_credits boolean NOT NULL DEFAULT false;

-- 2) Ajustar planos: Starter 150 créd, Pro Individual 750 créd, Clínica oculto
UPDATE public.subscription_plans
   SET monthly_credits = 150,
       description = 'Para quem atende até 30 pacientes por mês',
       updated_at = now()
 WHERE slug = 'starter';

UPDATE public.subscription_plans
   SET name = 'Pro Individual',
       monthly_credits = 750,
       description = 'Para quem atende mais de 30 pacientes por mês',
       updated_at = now()
 WHERE slug = 'pro';

UPDATE public.subscription_plans
   SET is_active = false,
       updated_at = now()
 WHERE slug = 'clinica';

-- 3) Bypass de créditos para usuários ilimitados na RPC consume_credits
CREATE OR REPLACE FUNCTION public.consume_credits(p_user_id uuid, p_agent_key text, p_message_preview text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cost INTEGER;
  v_label TEXT;
  v_current_balance INTEGER;
  v_unlimited BOOLEAN;
BEGIN
  SELECT cost_credits, display_name INTO v_cost, v_label
  FROM public.agent_costs
  WHERE agent_key = p_agent_key AND is_active = true;

  IF v_cost IS NULL OR v_cost = 0 THEN
    RETURN TRUE;
  END IF;

  -- Bypass: usuário com plano ilimitado (compromisso contratual antigo)
  SELECT COALESCE(bool_or(unlimited_credits), false) INTO v_unlimited
  FROM public.subscriptions
  WHERE user_id = p_user_id;

  IF v_unlimited THEN
    INSERT INTO public.credit_transactions (
      user_id, agent_key, agent_label, type, amount, balance_after, message_preview, metadata
    ) VALUES (
      p_user_id, p_agent_key, v_label, 'debit', 0, 0, p_message_preview,
      jsonb_build_object('unlimited', true, 'would_have_cost', v_cost)
    );
    RETURN TRUE;
  END IF;

  SELECT balance INTO v_current_balance
  FROM public.user_credits
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF v_current_balance IS NULL OR v_current_balance < v_cost THEN
    RETURN FALSE;
  END IF;

  UPDATE public.user_credits
  SET balance = balance - v_cost, updated_at = now()
  WHERE user_id = p_user_id;

  INSERT INTO public.credit_transactions (
    user_id, agent_key, agent_label, type, amount, balance_after, message_preview
  ) VALUES (
    p_user_id, p_agent_key, v_label, 'debit', v_cost, (v_current_balance - v_cost), p_message_preview
  );

  RETURN TRUE;
END;
$function$;
