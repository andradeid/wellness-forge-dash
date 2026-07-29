ALTER TABLE public.general_chats
  ADD COLUMN IF NOT EXISTS profile TEXT
  CHECK (profile IS NULL OR profile IN (
    'adulto_masculino','adulto_feminino','gestante_mono','gestante_gemelar'
  ));

COMMENT ON COLUMN public.general_chats.profile IS
  'Perfil clínico escolhido no início de uma conversa sem paciente (usado para rotear ao Super Agente correspondente).';