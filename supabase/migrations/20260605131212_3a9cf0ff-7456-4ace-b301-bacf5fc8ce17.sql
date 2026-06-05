ALTER TABLE public.dify_agents
ADD COLUMN IF NOT EXISTS card_trigger TEXT,
ADD COLUMN IF NOT EXISTS patient_required BOOLEAN 
  DEFAULT true,
ADD COLUMN IF NOT EXISTS is_active BOOLEAN 
  DEFAULT true;

-- Update existing agents
UPDATE public.dify_agents 
SET card_trigger = 'exames_de_sangue',
    patient_required = true,
    is_active = true
WHERE agent_id = 'exam';

UPDATE public.dify_agents 
SET card_trigger = 'plano_alimentar',
    patient_required = true,
    is_active = true
WHERE agent_id = 'production';

UPDATE public.dify_agents 
SET card_trigger = 'casos_clinicos',
    patient_required = true,
    is_active = true
WHERE agent_id = 'reasoning';

UPDATE public.dify_agents 
SET card_trigger = 'pesquisa_cientifica',
    patient_required = false,
    is_active = true
WHERE agent_id = 'research';