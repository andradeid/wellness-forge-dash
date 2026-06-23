
CREATE TABLE public.credit_packs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  credits integer NOT NULL CHECK (credits > 0),
  price_cents integer NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
  is_highlighted boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  perks jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.credit_packs TO authenticated;
GRANT ALL ON public.credit_packs TO service_role;

ALTER TABLE public.credit_packs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read active packs"
  ON public.credit_packs FOR SELECT TO authenticated
  USING (is_active = true OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Admins manage packs"
  ON public.credit_packs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER update_credit_packs_updated_at
  BEFORE UPDATE ON public.credit_packs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.credit_packs (slug, name, credits, price_cents, is_highlighted, sort_order, perks) VALUES
  ('avulso-30',  'Avulso 30',  30,  0, false, 1, '["Para um pico pontual de atendimentos","Créditos não expiram"]'::jsonb),
  ('avulso-150', 'Avulso 150', 150, 0, true,  2, '["Equivale a 1 mês de Starter","Créditos não expiram","Use quando quiser"]'::jsonb),
  ('avulso-500', 'Avulso 500', 500, 0, false, 3, '["Volume alto de atendimentos","Melhor preço por crédito","Créditos não expiram"]'::jsonb);
