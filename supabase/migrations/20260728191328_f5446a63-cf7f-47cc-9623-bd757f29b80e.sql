-- Atualizando labels nas tabelas de configuração para garantir consistência visual solicitada
UPDATE public.dify_agents 
SET label = 'Plano Alimentar & Formulações' 
WHERE label = 'Plano Alimentar & Receitas' OR label = 'Plano Alimentar e Formulações';

UPDATE public.super_agent_tasks 
SET label = 'Plano Alimentar & Formulações' 
WHERE label = 'Plano Alimentar & Receitas' OR label = 'Plano Alimentar e Formulações';

UPDATE public.super_agent_cards 
SET label = 'Plano Alimentar & Formulações' 
WHERE label = 'Plano Alimentar & Receitas' OR label = 'Plano Alimentar e Formulações';