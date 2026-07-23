-- Plano legado 500 (uso interno, invisível para compra)
INSERT INTO public.subscription_plans (slug, name, description, price_monthly_cents, price_yearly_cents, monthly_credits, is_active, sort_order)
VALUES ('legado_500', 'Legado 500', 'Plano de cortesia para base migrada (Black 2025). 500 créditos mensais, válido até 23/07/2027.', 0, 0, 500, false, 99)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  monthly_credits = EXCLUDED.monthly_credits,
  is_active = EXCLUDED.is_active,
  updated_at = now();

-- Etiqueta Black 2025
INSERT INTO public.user_tags (label, color)
VALUES ('Black 2025', '#111111')
ON CONFLICT DO NOTHING;