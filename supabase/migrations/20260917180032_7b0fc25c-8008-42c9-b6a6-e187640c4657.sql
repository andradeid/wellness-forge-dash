ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS stripe_extra_price_ids text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS stripe_extra_product_ids text[] NOT NULL DEFAULT '{}';

UPDATE public.subscription_plans
SET stripe_extra_price_ids = ARRAY['price_1UFdzMIjJyqfQCaTpIlJptUv'],
    stripe_extra_product_ids = ARRAY['prod_UvCuNFrWb1bV2i']
WHERE slug = 'starter';

UPDATE public.subscription_plans
SET stripe_extra_price_ids = ARRAY['price_1UFdw3IjJyqfQCaTQA5Am0wZ'],
    stripe_extra_product_ids = ARRAY['prod_UvCuwjqMl8DBvu']
WHERE slug = 'pro';