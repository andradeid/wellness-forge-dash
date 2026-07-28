DELETE FROM public.profile_tags
WHERE profile_id = '010af255-7f77-4539-91b5-93faffad1ddd'
  AND tag_id IN (SELECT id FROM public.user_tags WHERE label ILIKE 'ILIMITADO');

UPDATE public.subscriptions
SET unlimited_credits = false
WHERE user_id = '010af255-7f77-4539-91b5-93faffad1ddd';

INSERT INTO public.user_credits (user_id, balance, monthly_quota, quota_reset_at)
VALUES ('010af255-7f77-4539-91b5-93faffad1ddd', 1000, 1000, now() + interval '30 days')
ON CONFLICT (user_id) DO UPDATE
SET balance = 1000,
    monthly_quota = 1000,
    quota_reset_at = now() + interval '30 days',
    updated_at = now();