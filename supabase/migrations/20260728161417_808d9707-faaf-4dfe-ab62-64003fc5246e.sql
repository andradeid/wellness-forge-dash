
UPDATE auth.users SET banned_until = NULL WHERE id = '010af255-7f77-4539-91b5-93faffad1ddd';
UPDATE public.profiles SET is_blocked = false WHERE id = '010af255-7f77-4539-91b5-93faffad1ddd';
UPDATE public.subscriptions
  SET plan_type = 'starter',
      status = 'active',
      billing_cycle = 'yearly',
      current_period_end = '2027-04-30T23:59:59Z',
      unlimited_credits = false
  WHERE user_id = '010af255-7f77-4539-91b5-93faffad1ddd';
