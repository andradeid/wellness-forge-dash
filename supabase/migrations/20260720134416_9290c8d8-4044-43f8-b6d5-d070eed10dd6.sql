
ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS stripe_price_monthly_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_price_yearly_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_product_id TEXT;

ALTER TABLE public.credit_packs
  ADD COLUMN IF NOT EXISTS stripe_price_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_product_id TEXT;

UPDATE public.subscription_plans SET
  stripe_product_id = 'prod_Uv7Qv5YEsrU7EY',
  stripe_price_monthly_id = 'price_1TvHBQIjJyqfQCaTe1nkEZhQ',
  stripe_price_yearly_id  = 'price_1TvHBRIjJyqfQCaT9L37qLO3'
WHERE slug = 'starter';

UPDATE public.subscription_plans SET
  stripe_product_id = 'prod_Uv7U6K3K93UXcr',
  stripe_price_monthly_id = 'price_1TvHFmIjJyqfQCaT97ysrRdZ',
  stripe_price_yearly_id  = 'price_1TvHIDIjJyqfQCaTVsUEW2cR'
WHERE slug = 'pro';

UPDATE public.credit_packs SET
  stripe_product_id = 'prod_Uv7ZMqBtqv3WOP',
  stripe_price_id   = 'price_1TvHKMIjJyqfQCaTzFRAy3Gs'
WHERE slug = 'avulso-30';

UPDATE public.credit_packs SET
  stripe_product_id = 'prod_Uv7b9YEiOyzznr',
  stripe_price_id   = 'price_1TvHM8IjJyqfQCaT9DaFb3AS'
WHERE slug = 'avulso-150';

UPDATE public.credit_packs SET
  stripe_product_id = 'prod_Uv7cwbpq7CckOH',
  stripe_price_id   = 'price_1TvHNJIjJyqfQCaTjuQwtJ3p'
WHERE slug = 'avulso-500';
