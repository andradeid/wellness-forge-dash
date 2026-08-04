-- 1. Cria a sequence global
CREATE SEQUENCE IF NOT EXISTS public.curation_requests_numero_seq;

-- 2. Adiciona a coluna permitindo nulos para o backfill
ALTER TABLE public.curation_requests ADD COLUMN numero_sequencial INTEGER;

-- 3. Backfill: numera os existentes por ordem cronológica (created_at)
DO $$
DECLARE
    r RECORD;
    v_counter INTEGER := 1;
BEGIN
    FOR r IN (SELECT id FROM public.curation_requests ORDER BY created_at ASC, id ASC) LOOP
        UPDATE public.curation_requests 
        SET numero_sequencial = v_counter 
        WHERE id = r.id;
        v_counter := v_counter + 1;
    END LOOP;
    
    -- Sincroniza a sequence com o maior valor atual
    PERFORM setval('public.curation_requests_numero_seq', COALESCE((SELECT max(numero_sequencial) FROM public.curation_requests), 0));
END $$;

-- 4. Torna a coluna obrigatória e única, com default da sequence
ALTER TABLE public.curation_requests 
  ALTER COLUMN numero_sequencial SET DEFAULT nextval('public.curation_requests_numero_seq'),
  ALTER COLUMN numero_sequencial SET NOT NULL;

ALTER TABLE public.curation_requests ADD CONSTRAINT curation_requests_numero_sequencial_key UNIQUE (numero_sequencial);

-- 5. Garante que a sequence morra com a coluna
ALTER SEQUENCE public.curation_requests_numero_seq OWNED BY public.curation_requests.numero_sequencial;
