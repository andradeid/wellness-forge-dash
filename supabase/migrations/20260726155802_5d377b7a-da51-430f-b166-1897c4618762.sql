-- 1) Novas tarefas em cada um dos 4 super agentes
INSERT INTO public.super_agent_tasks (agent_id, task_key, label, icon, is_active, sort_order)
SELECT a.agent_id, tk.task_key, tk.label, tk.icon, true, tk.sort_order
FROM (VALUES
  ('super_masculino'),
  ('super_feminino'),
  ('super_gestante_mono'),
  ('super_gestante_gemelar')
) AS a(agent_id)
CROSS JOIN (VALUES
  ('bioimpedancia', 'Bioimpedância', 'activity', 8),
  ('calorimetria',  'Calorimetria',  'flame',    9),
  ('genetica',      'Genética',      'dna',     10),
  ('microbioma',    'Microbioma',    'sprout',  11)
) AS tk(task_key, label, icon, sort_order);

-- 2) Cards clínicos correspondentes (um por perfil), referenciando a task do próprio agente
INSERT INTO public.super_agent_cards (task_id, label, icon, card_trigger, is_active, sort_order)
SELECT t.id, tk.label, tk.icon, tk.card_trigger, true, tk.sort_order
FROM public.super_agent_tasks t
JOIN (VALUES
  ('bioimpedancia', 'bioimpedancia', 'Bioimpedância', 'activity',  8),
  ('calorimetria',  'calorimetria',  'Calorimetria',  'flame',     9),
  ('genetica',      'genetica',      'Genética',      'dna',      10),
  ('microbioma',    'microbioma',    'Microbioma',    'sprout',   11)
) AS tk(task_key, card_trigger, label, icon, sort_order)
  ON tk.task_key = t.task_key
WHERE t.agent_id IN ('super_masculino','super_feminino','super_gestante_mono','super_gestante_gemelar');