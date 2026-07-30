UPDATE auth.users u SET banned_until = NULL, updated_at = now()
FROM public.subscriptions s
WHERE s.user_id = u.id AND s.status = 'active' AND u.banned_until > now();

UPDATE public.profiles p SET is_blocked = false
FROM public.subscriptions s
WHERE s.user_id = p.id AND s.status = 'active' AND p.is_blocked = true;