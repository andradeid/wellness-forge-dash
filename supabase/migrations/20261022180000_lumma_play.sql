-- Lumma Play: área de treinamento estilo streaming.
-- Só cria objetos NOVOS (prefixo lumma_play_); não altera nenhuma tabela existente.
-- Para desfazer: supabase/rollback/20261022180000_lumma_play_down.sql

-- Configuração (uma linha só): quem pode ver.
--   off       = só super_admin
--   allowlist = super_admin + usuários em lumma_play_access
--   all       = todos os usuários logados
CREATE TABLE IF NOT EXISTS public.lumma_play_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  access_mode text NOT NULL DEFAULT 'allowlist' CHECK (access_mode IN ('off', 'allowlist', 'all')),
  series_title text NOT NULL DEFAULT 'Domine a Lumma, do início ao laudo',
  series_description text NOT NULL DEFAULT 'Do primeiro acesso ao laudo em PDF: a sua mentora virtual explicada passo a passo, para você atender com mais segurança e menos cliques.',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
INSERT INTO public.lumma_play_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Lista de quem foi liberado (modo allowlist).
CREATE TABLE IF NOT EXISTS public.lumma_play_access (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

CREATE TABLE IF NOT EXISTS public.lumma_play_tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.lumma_play_episodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id uuid NOT NULL REFERENCES public.lumma_play_tracks(id) ON DELETE CASCADE,
  number integer NOT NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  duration_seconds integer NOT NULL DEFAULT 0 CHECK (duration_seconds >= 0),
  video_provider text NOT NULL DEFAULT 'youtube' CHECK (video_provider IN ('youtube', 'cloudflare')),
  video_id text,               -- id do YouTube (11 caracteres) ou do Cloudflare Stream; vazio = "Em breve"
  thumbnail_url text,          -- vazio = usa a miniatura do YouTube
  sort_order integer NOT NULL DEFAULT 0,
  is_featured boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lumma_play_episodes_track ON public.lumma_play_episodes (track_id, sort_order);

CREATE TABLE IF NOT EXISTS public.lumma_play_progress (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  episode_id uuid NOT NULL REFERENCES public.lumma_play_episodes(id) ON DELETE CASCADE,
  position_seconds integer NOT NULL DEFAULT 0 CHECK (position_seconds >= 0),
  completed boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, episode_id)
);

-- Quem pode ver o Lumma Play.
-- Sem parâmetro: só responde pelo próprio usuário logado (ninguém consulta o acesso de outra pessoa).
CREATE OR REPLACE FUNCTION public.lumma_play_can_view()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    public.has_role(auth.uid(), 'super_admin')
    OR EXISTS (
      SELECT 1 FROM public.lumma_play_settings s
      WHERE s.id = 1 AND (
        s.access_mode = 'all'
        OR (s.access_mode = 'allowlist' AND EXISTS (SELECT 1 FROM public.lumma_play_access a WHERE a.user_id = auth.uid()))
      )
    )
  )
$$;

-- RLS
ALTER TABLE public.lumma_play_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lumma_play_access   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lumma_play_tracks   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lumma_play_episodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lumma_play_progress ENABLE ROW LEVEL SECURITY;

-- Políticas criadas só na primeira vez (sem DROP: o arquivo pode rodar de novo sem erro).
DO $pol$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'lumma_play_settings') THEN RETURN; END IF;
  CREATE POLICY lumma_play_settings_read ON public.lumma_play_settings FOR SELECT TO authenticated
    USING (public.lumma_play_can_view());
  CREATE POLICY lumma_play_settings_admin ON public.lumma_play_settings FOR UPDATE TO authenticated
    USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

  CREATE POLICY lumma_play_access_read ON public.lumma_play_access FOR SELECT TO authenticated
    USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'super_admin'));
  CREATE POLICY lumma_play_access_admin ON public.lumma_play_access FOR ALL TO authenticated
    USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

  CREATE POLICY lumma_play_tracks_read ON public.lumma_play_tracks FOR SELECT TO authenticated
    USING (public.lumma_play_can_view() AND (is_active OR public.has_role(auth.uid(), 'super_admin')));
  CREATE POLICY lumma_play_tracks_admin ON public.lumma_play_tracks FOR ALL TO authenticated
    USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

  CREATE POLICY lumma_play_episodes_read ON public.lumma_play_episodes FOR SELECT TO authenticated
    USING (public.lumma_play_can_view() AND (is_active OR public.has_role(auth.uid(), 'super_admin')));
  CREATE POLICY lumma_play_episodes_admin ON public.lumma_play_episodes FOR ALL TO authenticated
    USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

  CREATE POLICY lumma_play_progress_own ON public.lumma_play_progress FOR ALL TO authenticated
    USING (user_id = auth.uid() AND public.lumma_play_can_view())
    WITH CHECK (user_id = auth.uid() AND public.lumma_play_can_view());
END $pol$;

-- Sem políticas para anon: visitante não logado não lê nada (RLS nega por padrão).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lumma_play_settings, public.lumma_play_access, public.lumma_play_tracks,
  public.lumma_play_episodes, public.lumma_play_progress TO authenticated;

-- Conteúdo inicial: série "Domine a Lumma" (vídeos entram depois, video_id vazio = "Em breve").
DO $$
DECLARE t1 uuid; t2 uuid; t3 uuid; t4 uuid; t5 uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.lumma_play_tracks) THEN RETURN; END IF;
  INSERT INTO public.lumma_play_tracks (title, sort_order) VALUES ('Primeiros passos', 1) RETURNING id INTO t1;
  INSERT INTO public.lumma_play_tracks (title, sort_order) VALUES ('Painel e pacientes', 2) RETURNING id INTO t2;
  INSERT INTO public.lumma_play_tracks (title, sort_order) VALUES ('Análises com a Lumma', 3) RETURNING id INTO t3;
  INSERT INTO public.lumma_play_tracks (title, sort_order) VALUES ('Resultados e histórico', 4) RETURNING id INTO t4;
  INSERT INTO public.lumma_play_tracks (title, sort_order) VALUES ('Planos e suporte', 5) RETURNING id INTO t5;
  INSERT INTO public.lumma_play_episodes (track_id, number, title, description, duration_seconds, thumbnail_url, sort_order, is_featured) VALUES
    (t1, 1, 'Boas-vindas: o que é a Lumma', 'Conheça a sua mentora virtual e o que ela faz por você no consultório.', 70, '/lumma-play/ep01.jpg', 1, true),
    (t1, 2, 'Primeiro acesso e segurança da conta', 'Entre pela primeira vez, troque a senha e mantenha sua conta protegida.', 62, '/lumma-play/ep02.jpg', 2, false),
    (t1, 3, 'Seu perfil e sua marca nos documentos', 'Coloque seu nome, registro e logo para personalizar laudos e receitas.', 99, '/lumma-play/ep03.jpg', 3, false),
    (t2, 4, 'Dashboard: sua clínica num só olhar', 'Vidas impactadas, exames do mês e pacientes que pedem atenção.', 111, '/lumma-play/ep04.jpg', 4, false),
    (t2, 5, 'Cadastrando pacientes do jeito certo', 'Os dados que fazem a Lumma escolher a análise certa para cada perfil.', 126, '/lumma-play/ep05.jpg', 5, false),
    (t2, 6, 'Página Inicial: os 12 atalhos', 'Todas as análises da Lumma a um clique de distância.', 80, '/lumma-play/ep06.jpg', 6, false),
    (t3, 7, 'O atendimento e a escolha da tarefa', 'Como começar uma consulta e escolher a tarefa ideal.', 65, '/lumma-play/ep07.jpg', 7, false),
    (t3, 8, 'Analisando um exame de sangue', 'Envie o PDF ou a foto e veja os marcadores classificados um a um.', 132, '/lumma-play/ep08.jpg', 8, false),
    (t3, 9, 'Plano alimentar, formulações e receita', 'Do raciocínio clínico à receita pronta para entregar.', 80, '/lumma-play/ep09.jpg', 9, false),
    (t3, 10, 'Refeição e composição corporal por foto', 'Estimativa da refeição e da composição corporal a partir de uma foto.', 101, '/lumma-play/ep10.jpg', 10, false),
    (t3, 11, 'Bioimpedância, calorimetria, genética e microbioma', 'Os laudos especiais e como a Lumma interpreta cada um.', 50, '/lumma-play/ep11.jpg', 11, false),
    (t3, 12, 'Casos clínicos e sintomas', 'Discuta casos e sintomas com o apoio da metodologia.', 68, '/lumma-play/ep12.jpg', 12, false),
    (t3, 13, 'Pesquisa Científica e Perguntas Clínicas', 'Respostas com base em evidência para as suas dúvidas.', 112, '/lumma-play/ep13.jpg', 13, false),
    (t4, 14, 'Evolução clínica e laudo em PDF', 'Acompanhe a evolução da paciente e gere o laudo com a sua marca.', 83, '/lumma-play/ep14.jpg', 14, false),
    (t4, 15, 'Exportar conversa e histórico do paciente', 'Leve a consulta para fora da Lumma quando precisar.', 67, '/lumma-play/ep15.jpg', 15, false),
    (t4, 16, 'Central de Conversas', 'Todas as conversas num só lugar, fáceis de achar.', 30, '/lumma-play/ep16.jpg', 16, false),
    (t4, 17, 'Avaliando as respostas da Lumma', 'Sua avaliação deixa a Lumma cada vez melhor.', 51, '/lumma-play/ep17.jpg', 17, false),
    (t5, 18, 'Planos, créditos e quanto custa cada análise', 'Entenda os créditos e como economizar em cada análise.', 143, '/lumma-play/ep18.jpg', 18, false),
    (t5, 19, 'Encerramento e suporte', 'Onde pedir ajuda e os próximos passos.', 46, '/lumma-play/ep19.jpg', 19, false);
END $$;

-- Liberação inicial para teste (conta setupdigitalclientes@gmail.com). Super admin já vê sempre.
INSERT INTO public.lumma_play_access (user_id)
SELECT id FROM auth.users WHERE email = 'setupdigitalclientes@gmail.com'
ON CONFLICT (user_id) DO NOTHING;
