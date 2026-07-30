UPDATE public.subscriptions SET plan_type='starter', status='active', billing_cycle='yearly', current_period_end=(now() + interval '1 year'), unlimited_credits=false, cancelled_at=NULL, updated_at=now() WHERE user_id='57b58670-1919-43ea-b844-ad848196b519';
INSERT INTO public.user_credits (user_id, balance, monthly_quota, quota_reset_at)
VALUES ('57b58670-1919-43ea-b844-ad848196b519', 1000, 1000, (now() + interval '1 month'))
ON CONFLICT (user_id) DO UPDATE SET balance=1000, monthly_quota=1000, quota_reset_at=(now() + interval '1 month');
UPDATE public.profiles SET is_blocked=false WHERE id='57b58670-1919-43ea-b844-ad848196b519';