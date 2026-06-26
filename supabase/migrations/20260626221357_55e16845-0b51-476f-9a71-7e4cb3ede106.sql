
-- 1) Catálogo de etiquetas
CREATE TABLE public.user_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  color text NOT NULL DEFAULT '#e8a04c',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_tags_label_unique UNIQUE (label)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_tags TO authenticated;
GRANT ALL ON public.user_tags TO service_role;

ALTER TABLE public.user_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin manage user_tags"
  ON public.user_tags FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "authenticated read user_tags"
  ON public.user_tags FOR SELECT
  TO authenticated
  USING (true);

CREATE TRIGGER update_user_tags_updated_at
  BEFORE UPDATE ON public.user_tags
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Associação profile <-> tag
CREATE TABLE public.profile_tags (
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.user_tags(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, tag_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profile_tags TO authenticated;
GRANT ALL ON public.profile_tags TO service_role;

ALTER TABLE public.profile_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin manage profile_tags"
  ON public.profile_tags FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "authenticated read profile_tags"
  ON public.profile_tags FOR SELECT
  TO authenticated
  USING (true);

CREATE INDEX idx_profile_tags_tag ON public.profile_tags(tag_id);
CREATE INDEX idx_profile_tags_profile ON public.profile_tags(profile_id);
