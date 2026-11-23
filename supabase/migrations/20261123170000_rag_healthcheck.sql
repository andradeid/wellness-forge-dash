-- Alerta da base de conhecimento (reranqueador Cohere). Ver src/lib/rag-health.server.ts.
-- Caso real: ~05/11 a 23/11/2026 a Cohere ficou bloqueada (fatura em aberto) e a
-- busca nas bases de Formulações/Composição/Refeição voltou vazia sem erro.

alter table public.system_settings
  add column if not exists rag_health_status text,
  add column if not exists rag_health_failed_since timestamptz,
  add column if not exists rag_health_last_alert_at timestamptz,
  add column if not exists rag_health_checked_at timestamptz,
  add column if not exists rag_health_detail text;

-- Campos em Admin → Integrações → Inteligência Artificial.
insert into public.integrations (key, value, is_secret, label, category, description)
values
  ('dify_dataset_api_key', null, true, 'Chave da API de Conhecimento do Dify (alerta da base)', 'ai',
   'Dify → Conhecimento → API → chave "dataset-…". Usada só pelo teste da base (Cohere) a cada 30 min.'),
  ('rag_healthcheck_dataset_id', null, false, 'Base usada no teste do alerta (opcional)', 'ai',
   'Vazio = base de Formulações, achada pelo nome.')
on conflict (key) do nothing;

-- Job a cada 30 min. O cabeçalho apikey é a mesma chave pública do job ai-maintenance-probe
-- (copiada de lá ao aplicar; no repositório fica o marcador).
select cron.schedule(
  'rag-healthcheck',
  '*/30 * * * *',
  $job$
  select net.http_post(
    url := 'https://lumma.ia.br/api/public/rag-healthcheck',
    headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', '<CHAVE_PUBLICA_ANON>'),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $job$
);
