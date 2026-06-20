ALTER TABLE public.system_settings
  ADD COLUMN IF NOT EXISTS maintenance_badge TEXT NOT NULL DEFAULT 'LUMMA · Em evolução',
  ADD COLUMN IF NOT EXISTS maintenance_title TEXT NOT NULL DEFAULT 'Estamos em evolução.',
  ADD COLUMN IF NOT EXISTS maintenance_subtitle TEXT NOT NULL DEFAULT 'No momento, estamos aprimorando nossa inteligência artificial para entregar o que há de melhor raciocínio clínico em Nutrição Funcional e Integrativa.',
  ADD COLUMN IF NOT EXISTS maintenance_footer TEXT NOT NULL DEFAULT 'Treinando modelos · sincronizando agentes · ajustando protocolos';