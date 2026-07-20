
UPDATE public.subscription_plans SET
  stripe_price_monthly_id = 'price_1TvMUvIjJyqfQCaTyQGjZjDH',
  stripe_price_yearly_id  = 'price_1TvMUvIjJyqfQCaTwtAcoSkO'
WHERE slug = 'starter';

UPDATE public.subscription_plans SET
  stripe_price_monthly_id = 'price_1TvMV5IjJyqfQCaTqTTzHYgU',
  stripe_price_yearly_id  = 'price_1TvMV5IjJyqfQCaTHOnfCBOi'
WHERE slug = 'pro';

UPDATE public.credit_packs SET stripe_price_id = 'price_1TvMVCIjJyqfQCaTCyN4uuKl' WHERE slug = 'avulso-150';
UPDATE public.credit_packs SET stripe_price_id = 'price_1TvMVHIjJyqfQCaTO6NtcOJK' WHERE slug = 'avulso-600';
UPDATE public.credit_packs SET stripe_price_id = 'price_1TvMVKIjJyqfQCaT6ld8npXz' WHERE slug = 'avulso-2000';
