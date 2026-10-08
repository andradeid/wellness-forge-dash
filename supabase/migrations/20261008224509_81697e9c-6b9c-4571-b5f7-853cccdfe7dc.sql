CREATE TABLE public.mcp_write_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid NOT NULL,
  tool text NOT NULL,
  report_numero integer,
  round_id uuid,
  input jsonb NOT NULL DEFAULT '{}'::jsonb,
  changes jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX mcp_write_audit_report_idx ON public.mcp_write_audit(report_numero);
CREATE INDEX mcp_write_audit_round_idx ON public.mcp_write_audit(round_id);
GRANT SELECT ON public.mcp_write_audit TO authenticated;
GRANT SELECT, INSERT ON public.mcp_write_audit TO service_role;
ALTER TABLE public.mcp_write_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "super admin reads mcp audit" ON public.mcp_write_audit FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role));

-- ===== helpers (sem privilégio elevado) =====
CREATE OR REPLACE FUNCTION public._mcp_check_keys(p jsonb, allowed text[], ctx text)
RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
DECLARE k text;
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'object' THEN
    RAISE EXCEPTION '%: esperado um objeto.', ctx; END IF;
  FOR k IN SELECT jsonb_object_keys(p) LOOP
    IF NOT (k = ANY(allowed)) THEN
      RAISE EXCEPTION '%: campo "%" não é aceito por esta ferramenta.', ctx, k; END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public._mcp_date(v jsonb, ctx text, campo text, obrigatorio boolean)
RETURNS date LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
DECLARE s text;
BEGIN
  IF v IS NULL OR jsonb_typeof(v) = 'null' THEN
    IF obrigatorio THEN RAISE EXCEPTION '%: campo "%" é obrigatório.', ctx, campo; END IF;
    RETURN NULL;
  END IF;
  IF jsonb_typeof(v) <> 'string' THEN RAISE EXCEPTION '%: campo "%" deve ser texto AAAA-MM-DD, recebido %.', ctx, campo, v::text; END IF;
  s := v #>> '{}';
  IF s !~ '^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION '%: campo "%" com valor "%" fora do formato AAAA-MM-DD.', ctx, campo, s; END IF;
  BEGIN RETURN s::date;
  EXCEPTION WHEN others THEN RAISE EXCEPTION '%: campo "%" com data inválida "%".', ctx, campo, s; END;
END $$;

CREATE OR REPLACE FUNCTION public._mcp_text(v jsonb, ctx text, campo text, obrigatorio boolean)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF v IS NULL OR jsonb_typeof(v) = 'null' THEN
    IF obrigatorio THEN RAISE EXCEPTION '%: campo "%" é obrigatório.', ctx, campo; END IF;
    RETURN NULL;
  END IF;
  IF jsonb_typeof(v) <> 'string' THEN RAISE EXCEPTION '%: campo "%" deve ser texto, recebido %.', ctx, campo, v::text; END IF;
  IF obrigatorio AND btrim(v #>> '{}') = '' THEN RAISE EXCEPTION '%: campo "%" não pode ser vazio.', ctx, campo; END IF;
  RETURN v #>> '{}';
END $$;

CREATE OR REPLACE FUNCTION public._mcp_enum(v jsonb, ctx text, campo text, allowed text[])
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
DECLARE s text;
BEGIN
  IF v IS NULL OR jsonb_typeof(v) <> 'string' THEN
    RAISE EXCEPTION '%: campo "%" obrigatório, aceita apenas: %.', ctx, campo, array_to_string(allowed, ', '); END IF;
  s := v #>> '{}';
  IF NOT (s = ANY(allowed)) THEN
    RAISE EXCEPTION '%: campo "%" recusou o valor "%". Aceita apenas: %.', ctx, campo, s, array_to_string(allowed, ', '); END IF;
  RETURN s;
END $$;

CREATE OR REPLACE FUNCTION public._mcp_int(v jsonb, ctx text, campo text)
RETURNS integer LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF v IS NULL OR jsonb_typeof(v) <> 'number' OR (v #>> '{}') !~ '^-?\d+$' THEN
    RAISE EXCEPTION '%: campo "%" deve ser número inteiro, recebido %.', ctx, campo, coalesce(v::text, 'nada'); END IF;
  RETURN (v #>> '{}')::integer;
END $$;

CREATE OR REPLACE FUNCTION public._mcp_require_super_admin()
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v uuid := auth.uid();
BEGIN
  IF v IS NULL OR NOT public.has_role(v, 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'Acesso negado: escrita no MCP é exclusiva de super_admin.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN v;
END $$;

-- valida o sort_order 1..N de uma rodada já gravada (dentro da transação)
CREATE OR REPLACE FUNCTION public._mcp_check_sort(p_round uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE n int; dup int; furo int;
BEGIN
  SELECT count(*) INTO n FROM changelog_items WHERE round_id = p_round;
  SELECT sort_order INTO dup FROM changelog_items WHERE round_id = p_round GROUP BY sort_order HAVING count(*) > 1 LIMIT 1;
  IF dup IS NOT NULL THEN RAISE EXCEPTION 'sort_order: valor % repetido na rodada.', dup; END IF;
  SELECT g INTO furo FROM generate_series(1, n) g
    WHERE NOT EXISTS (SELECT 1 FROM changelog_items WHERE round_id = p_round AND sort_order = g) LIMIT 1;
  IF furo IS NOT NULL THEN RAISE EXCEPTION 'sort_order: deve ser sequencial de 1 a %; falta o %.', n, furo; END IF;
END $$;

-- insere um item validado; retorna id
CREATE OR REPLACE FUNCTION public._mcp_insert_item(p_round uuid, it jsonb, ctx text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_id uuid;
BEGIN
  PERFORM public._mcp_check_keys(it, ARRAY['descricao_legivel','classificacao','camada','descricao_tecnica','item_data','sort_order','reports'], ctx);
  INSERT INTO changelog_items(round_id, descricao_legivel, classificacao, camada, descricao_tecnica, item_data, sort_order)
  VALUES (p_round,
    public._mcp_text(it->'descricao_legivel', ctx, 'descricao_legivel', true),
    public._mcp_enum(it->'classificacao', ctx, 'classificacao', ARRAY['suporte','melhoria','infra']),
    public._mcp_enum(it->'camada', ctx, 'camada', ARRAY['dify','lovable','banco','kb']),
    public._mcp_text(it->'descricao_tecnica', ctx, 'descricao_tecnica', false),
    public._mcp_date(it->'item_data', ctx, 'item_data', true),
    public._mcp_int(it->'sort_order', ctx, 'sort_order'))
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- liga reports (array de números) a um item; retorna lista de resultados
CREATE OR REPLACE FUNCTION public._mcp_link(p_item uuid, p_reports jsonb, ctx text, p_actor uuid, p_round uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r jsonb; num int; req uuid; res jsonb := '[]'::jsonb; ins int;
BEGIN
  IF p_reports IS NULL OR jsonb_typeof(p_reports) = 'null' THEN RETURN res; END IF;
  IF jsonb_typeof(p_reports) <> 'array' THEN RAISE EXCEPTION '%: "reports" deve ser lista de números.', ctx; END IF;
  FOR r IN SELECT * FROM jsonb_array_elements(p_reports) LOOP
    num := public._mcp_int(r, ctx, 'reports');
    SELECT id INTO req FROM curation_requests WHERE numero_sequencial = num;
    IF req IS NULL THEN RAISE EXCEPTION '%: report #% não existe.', ctx, num; END IF;
    INSERT INTO changelog_item_reports(item_id, request_id) VALUES (p_item, req) ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS ins = ROW_COUNT;
    res := res || jsonb_build_object('item_id', p_item, 'report', num, 'resultado', CASE WHEN ins = 1 THEN 'criada' ELSE 'ja_existia' END);
    IF ins = 1 THEN
      INSERT INTO mcp_write_audit(actor_id, tool, report_numero, round_id, input, changes)
      VALUES (p_actor, 'link_report_to_item', num, p_round, jsonb_build_object('item_id', p_item, 'report', num), jsonb_build_object('acao','ligar'));
    END IF;
  END LOOP;
  RETURN res;
END $$;

-- ===== 1. create =====
CREATE OR REPLACE FUNCTION public.mcp_create_changelog_round(p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_actor uuid := public._mcp_require_super_admin();
  v_data date; v_fim date; v_existing record; v_round uuid; it jsonb; i int := 0;
  v_ids uuid[] := '{}'; v_item uuid; v_links jsonb := '[]'::jsonb;
BEGIN
  PERFORM public._mcp_check_keys(p, ARRAY['titulo','rodada_data','rodada_data_fim','notas_curador','notas_admin','itens'], 'rodada');
  v_data := public._mcp_date(p->'rodada_data', 'rodada', 'rodada_data', true);
  v_fim := public._mcp_date(p->'rodada_data_fim', 'rodada', 'rodada_data_fim', false);
  IF v_fim IS NOT NULL AND v_fim < v_data THEN RAISE EXCEPTION 'rodada: rodada_data_fim (%) anterior a rodada_data (%).', v_fim, v_data; END IF;
  SELECT id, titulo INTO v_existing FROM changelog_rounds WHERE rodada_data = v_data;
  IF FOUND THEN RAISE EXCEPTION 'rodada: já existe rodada em % — "%" (id %). Nada foi gravado.', to_char(v_data,'DD/MM/YYYY'), v_existing.titulo, v_existing.id; END IF;
  IF jsonb_typeof(p->'itens') IS DISTINCT FROM 'array' OR jsonb_array_length(p->'itens') = 0 THEN
    RAISE EXCEPTION 'rodada: "itens" é obrigatório e precisa ter ao menos um item.'; END IF;

  INSERT INTO changelog_rounds(titulo, rodada_data, rodada_data_fim, notas_curador, notas_admin)
  VALUES (public._mcp_text(p->'titulo','rodada','titulo',true), v_data, v_fim,
          public._mcp_text(p->'notas_curador','rodada','notas_curador',false),
          public._mcp_text(p->'notas_admin','rodada','notas_admin',false))
  RETURNING id INTO v_round;

  FOR it IN SELECT * FROM jsonb_array_elements(p->'itens') LOOP
    i := i + 1;
    v_item := public._mcp_insert_item(v_round, it, 'item ' || i);
    v_ids := v_ids || v_item;
    v_links := v_links || public._mcp_link(v_item, it->'reports', 'item ' || i, v_actor, v_round);
  END LOOP;
  PERFORM public._mcp_check_sort(v_round);

  INSERT INTO mcp_write_audit(actor_id, tool, round_id, input, changes)
  VALUES (v_actor, 'create_changelog_round', v_round, p, jsonb_build_object('item_ids', to_jsonb(v_ids), 'ligacoes', v_links));

  RETURN jsonb_build_object('round_id', v_round, 'item_ids', to_jsonb(v_ids),
    'linhas', jsonb_build_object('changelog_rounds', 1, 'changelog_items', array_length(v_ids,1), 'changelog_item_reports', jsonb_array_length(v_links)),
    'ligacoes', v_links);
END $$;

-- ===== 2. update =====
CREATE OR REPLACE FUNCTION public.mcp_update_changelog_round(p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_actor uuid := public._mcp_require_super_admin();
  v_round uuid; r_old changelog_rounds%ROWTYPE; r_new changelog_rounds%ROWTYPE;
  i_old changelog_items%ROWTYPE; i_new changelog_items%ROWTYPE;
  mud jsonb := '[]'::jsonb; criados jsonb := '[]'::jsonb; apagados jsonb := '[]'::jsonb; links jsonb := '[]'::jsonb;
  ro jsonb; it jsonb; k text; n int := 0; v_item uuid; v_other record; ctx text; idtxt text;
BEGIN
  PERFORM public._mcp_check_keys(p, ARRAY['round_id','rodada','itens_alterar','itens_novos','itens_apagar'], 'pedido');
  idtxt := public._mcp_text(p->'round_id','pedido','round_id',true);
  BEGIN v_round := idtxt::uuid; EXCEPTION WHEN others THEN RAISE EXCEPTION 'pedido: round_id "%" não é um uuid válido.', idtxt; END;
  SELECT * INTO r_old FROM changelog_rounds WHERE id = v_round FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'pedido: rodada % não existe.', v_round; END IF;

  -- rodada
  IF p ? 'rodada' THEN
    ro := p->'rodada';
    PERFORM public._mcp_check_keys(ro, ARRAY['titulo','rodada_data','rodada_data_fim','notas_curador','notas_admin'], 'rodada');
    r_new := r_old;
    IF ro ? 'titulo' THEN r_new.titulo := public._mcp_text(ro->'titulo','rodada','titulo',true); END IF;
    IF ro ? 'rodada_data' THEN r_new.rodada_data := public._mcp_date(ro->'rodada_data','rodada','rodada_data',true); END IF;
    IF ro ? 'rodada_data_fim' THEN r_new.rodada_data_fim := public._mcp_date(ro->'rodada_data_fim','rodada','rodada_data_fim',false); END IF;
    IF ro ? 'notas_curador' THEN r_new.notas_curador := public._mcp_text(ro->'notas_curador','rodada','notas_curador',false); END IF;
    IF ro ? 'notas_admin' THEN r_new.notas_admin := public._mcp_text(ro->'notas_admin','rodada','notas_admin',false); END IF;
    IF r_new.rodada_data_fim IS NOT NULL AND r_new.rodada_data_fim < r_new.rodada_data THEN
      RAISE EXCEPTION 'rodada: rodada_data_fim (%) anterior a rodada_data (%).', r_new.rodada_data_fim, r_new.rodada_data; END IF;
    IF r_new.rodada_data <> r_old.rodada_data THEN
      SELECT id, titulo INTO v_other FROM changelog_rounds WHERE rodada_data = r_new.rodada_data AND id <> v_round;
      IF FOUND THEN RAISE EXCEPTION 'rodada: já existe rodada em % — "%" (id %).', to_char(r_new.rodada_data,'DD/MM/YYYY'), v_other.titulo, v_other.id; END IF;
    END IF;
    FOREACH k IN ARRAY ARRAY['titulo','rodada_data','rodada_data_fim','notas_curador','notas_admin'] LOOP
      IF to_jsonb(r_old)->k IS DISTINCT FROM to_jsonb(r_new)->k THEN
        mud := mud || jsonb_build_object('alvo','rodada','campo',k,'antes',to_jsonb(r_old)->k,'depois',to_jsonb(r_new)->k);
      END IF;
    END LOOP;
    UPDATE changelog_rounds SET titulo=r_new.titulo, rodada_data=r_new.rodada_data, rodada_data_fim=r_new.rodada_data_fim,
      notas_curador=r_new.notas_curador, notas_admin=r_new.notas_admin, updated_at=now() WHERE id = v_round;
  END IF;

  -- apagar (guarda conteúdo completo)
  IF p ? 'itens_apagar' THEN
    IF jsonb_typeof(p->'itens_apagar') <> 'array' THEN RAISE EXCEPTION 'itens_apagar: deve ser lista de ids.'; END IF;
    FOR it IN SELECT * FROM jsonb_array_elements(p->'itens_apagar') LOOP
      idtxt := public._mcp_text(it,'itens_apagar','id',true);
      BEGIN v_item := idtxt::uuid; EXCEPTION WHEN others THEN RAISE EXCEPTION 'itens_apagar: "%" não é uuid válido.', idtxt; END;
      SELECT * INTO i_old FROM changelog_items WHERE id = v_item;
      IF NOT FOUND OR i_old.round_id <> v_round THEN RAISE EXCEPTION 'itens_apagar: item % não pertence a esta rodada.', v_item; END IF;
      apagados := apagados || (to_jsonb(i_old) || jsonb_build_object('reports_ligados',
        (SELECT coalesce(jsonb_agg(cr.numero_sequencial),'[]'::jsonb) FROM changelog_item_reports l JOIN curation_requests cr ON cr.id=l.request_id WHERE l.item_id=v_item)));
      DELETE FROM changelog_items WHERE id = v_item;
    END LOOP;
  END IF;

  -- alterar
  IF p ? 'itens_alterar' THEN
    IF jsonb_typeof(p->'itens_alterar') <> 'array' THEN RAISE EXCEPTION 'itens_alterar: deve ser lista.'; END IF;
    FOR it IN SELECT * FROM jsonb_array_elements(p->'itens_alterar') LOOP
      n := n + 1; ctx := 'itens_alterar ' || n;
      PERFORM public._mcp_check_keys(it, ARRAY['id','descricao_legivel','classificacao','camada','descricao_tecnica','item_data','sort_order'], ctx);
      idtxt := public._mcp_text(it->'id',ctx,'id',true);
      BEGIN v_item := idtxt::uuid; EXCEPTION WHEN others THEN RAISE EXCEPTION '%: id "%" não é uuid válido.', ctx, idtxt; END;
      SELECT * INTO i_old FROM changelog_items WHERE id = v_item;
      IF NOT FOUND OR i_old.round_id <> v_round THEN RAISE EXCEPTION '%: item % não pertence a esta rodada.', ctx, v_item; END IF;
      i_new := i_old;
      IF it ? 'descricao_legivel' THEN i_new.descricao_legivel := public._mcp_text(it->'descricao_legivel',ctx,'descricao_legivel',true); END IF;
      IF it ? 'classificacao' THEN i_new.classificacao := public._mcp_enum(it->'classificacao',ctx,'classificacao',ARRAY['suporte','melhoria','infra']); END IF;
      IF it ? 'camada' THEN i_new.camada := public._mcp_enum(it->'camada',ctx,'camada',ARRAY['dify','lovable','banco','kb']); END IF;
      IF it ? 'descricao_tecnica' THEN i_new.descricao_tecnica := public._mcp_text(it->'descricao_tecnica',ctx,'descricao_tecnica',false); END IF;
      IF it ? 'item_data' THEN i_new.item_data := public._mcp_date(it->'item_data',ctx,'item_data',true); END IF;
      IF it ? 'sort_order' THEN i_new.sort_order := public._mcp_int(it->'sort_order',ctx,'sort_order'); END IF;
      FOREACH k IN ARRAY ARRAY['descricao_legivel','classificacao','camada','descricao_tecnica','item_data','sort_order'] LOOP
        IF to_jsonb(i_old)->k IS DISTINCT FROM to_jsonb(i_new)->k THEN
          mud := mud || jsonb_build_object('alvo','item '||v_item,'campo',k,'antes',to_jsonb(i_old)->k,'depois',to_jsonb(i_new)->k);
        END IF;
      END LOOP;
      UPDATE changelog_items SET descricao_legivel=i_new.descricao_legivel, classificacao=i_new.classificacao, camada=i_new.camada,
        descricao_tecnica=i_new.descricao_tecnica, item_data=i_new.item_data, sort_order=i_new.sort_order, updated_at=now() WHERE id=v_item;
    END LOOP;
  END IF;

  -- novos
  IF p ? 'itens_novos' THEN
    IF jsonb_typeof(p->'itens_novos') <> 'array' THEN RAISE EXCEPTION 'itens_novos: deve ser lista.'; END IF;
    n := 0;
    FOR it IN SELECT * FROM jsonb_array_elements(p->'itens_novos') LOOP
      n := n + 1;
      v_item := public._mcp_insert_item(v_round, it, 'itens_novos ' || n);
      criados := criados || jsonb_build_object('id', v_item, 'sort_order', it->'sort_order');
      links := links || public._mcp_link(v_item, it->'reports', 'itens_novos ' || n, v_actor, v_round);
    END LOOP;
  END IF;

  PERFORM public._mcp_check_sort(v_round);

  INSERT INTO mcp_write_audit(actor_id, tool, round_id, input, changes)
  VALUES (v_actor, 'update_changelog_round', v_round, p,
    jsonb_build_object('mudancas', mud, 'criados', criados, 'apagados', apagados, 'ligacoes', links));

  RETURN jsonb_build_object('round_id', v_round, 'mudancas', mud, 'criados', criados, 'apagados', apagados, 'ligacoes', links);
END $$;

-- ===== 3. link / unlink =====
CREATE OR REPLACE FUNCTION public.mcp_link_reports(p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_actor uuid := public._mcp_require_super_admin();
  v_acao text; it jsonb; n int := 0; ctx text; idtxt text; v_item uuid; v_round uuid; num int; req uuid; cnt int;
  res jsonb := '[]'::jsonb;
BEGIN
  PERFORM public._mcp_check_keys(p, ARRAY['acao','ligacoes'], 'pedido');
  v_acao := public._mcp_enum(p->'acao','pedido','acao',ARRAY['ligar','remover']);
  IF jsonb_typeof(p->'ligacoes') IS DISTINCT FROM 'array' OR jsonb_array_length(p->'ligacoes') = 0 THEN
    RAISE EXCEPTION 'pedido: "ligacoes" precisa ter ao menos uma ligação.'; END IF;
  FOR it IN SELECT * FROM jsonb_array_elements(p->'ligacoes') LOOP
    n := n + 1; ctx := 'ligacao ' || n;
    PERFORM public._mcp_check_keys(it, ARRAY['item_id','report'], ctx);
    idtxt := public._mcp_text(it->'item_id',ctx,'item_id',true);
    BEGIN v_item := idtxt::uuid; EXCEPTION WHEN others THEN RAISE EXCEPTION '%: item_id "%" não é uuid válido.', ctx, idtxt; END;
    SELECT round_id INTO v_round FROM changelog_items WHERE id = v_item;
    IF NOT FOUND THEN RAISE EXCEPTION '%: item % não existe.', ctx, v_item; END IF;
    num := public._mcp_int(it->'report', ctx, 'report');
    SELECT id INTO req FROM curation_requests WHERE numero_sequencial = num;
    IF req IS NULL THEN RAISE EXCEPTION '%: report #% não existe.', ctx, num; END IF;
    IF v_acao = 'ligar' THEN
      INSERT INTO changelog_item_reports(item_id, request_id) VALUES (v_item, req) ON CONFLICT DO NOTHING;
      GET DIAGNOSTICS cnt = ROW_COUNT;
      res := res || jsonb_build_object('item_id',v_item,'report',num,'resultado',CASE WHEN cnt=1 THEN 'criada' ELSE 'ja_existia' END);
    ELSE
      DELETE FROM changelog_item_reports WHERE item_id = v_item AND request_id = req;
      GET DIAGNOSTICS cnt = ROW_COUNT;
      res := res || jsonb_build_object('item_id',v_item,'report',num,'resultado',CASE WHEN cnt=1 THEN 'removida' ELSE 'nao_existia' END);
    END IF;
    IF cnt = 1 THEN
      INSERT INTO mcp_write_audit(actor_id, tool, report_numero, round_id, input, changes)
      VALUES (v_actor, 'link_report_to_item', num, v_round, it, jsonb_build_object('acao', v_acao));
    END IF;
  END LOOP;
  RETURN jsonb_build_object('acao', v_acao, 'resultados', res);
END $$;

-- ===== 4. gestão do report =====
CREATE OR REPLACE FUNCTION public.mcp_update_report_management(p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_actor uuid := public._mcp_require_super_admin();
  num int; o record; n_status text; n_final text; n_grupo text; n_notas text; mud jsonb := '[]'::jsonb; aviso text;
BEGIN
  PERFORM public._mcp_check_keys(p, ARRAY['report','status','admin_final_classification','grupo_tematico','admin_notes'], 'pedido');
  num := public._mcp_int(p->'report','pedido','report');
  IF NOT (p ?| ARRAY['status','admin_final_classification','grupo_tematico','admin_notes']) THEN
    RAISE EXCEPTION 'pedido: informe ao menos um de status, admin_final_classification, grupo_tematico, admin_notes.'; END IF;
  SELECT id, status, admin_final_classification, grupo_tematico, admin_notes INTO o
    FROM curation_requests WHERE numero_sequencial = num FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'pedido: report #% não existe.', num; END IF;
  n_status := o.status; n_final := o.admin_final_classification; n_grupo := o.grupo_tematico; n_notas := o.admin_notes;
  IF p ? 'status' THEN n_status := public._mcp_enum(p->'status','pedido','status',
    ARRAY['registrado','em_analise','aprovado_ajuste','classificado_melhoria','em_desenvolvimento','concluido']); END IF;
  IF p ? 'admin_final_classification' THEN
    IF jsonb_typeof(p->'admin_final_classification') = 'null' THEN n_final := NULL;
    ELSE n_final := public._mcp_enum(p->'admin_final_classification','pedido','admin_final_classification',
      ARRAY['suporte','melhoria','requer_analise_humana']); END IF;
  END IF;
  IF p ? 'grupo_tematico' THEN n_grupo := public._mcp_text(p->'grupo_tematico','pedido','grupo_tematico',false); END IF;
  IF p ? 'admin_notes' THEN n_notas := public._mcp_text(p->'admin_notes','pedido','admin_notes',false); END IF;

  IF n_status IS DISTINCT FROM o.status THEN mud := mud || jsonb_build_object('campo','status','antes',o.status,'depois',n_status); END IF;
  IF n_final IS DISTINCT FROM o.admin_final_classification THEN mud := mud || jsonb_build_object('campo','admin_final_classification','antes',o.admin_final_classification,'depois',n_final); END IF;
  IF n_grupo IS DISTINCT FROM o.grupo_tematico THEN mud := mud || jsonb_build_object('campo','grupo_tematico','antes',o.grupo_tematico,'depois',n_grupo); END IF;
  IF n_notas IS DISTINCT FROM o.admin_notes THEN mud := mud || jsonb_build_object('campo','admin_notes','antes',o.admin_notes,'depois',n_notas); END IF;

  UPDATE curation_requests SET status=n_status, admin_final_classification=n_final, grupo_tematico=n_grupo, admin_notes=n_notas, updated_at=now()
    WHERE id = o.id;

  IF n_status = 'concluido' AND NOT EXISTS (SELECT 1 FROM changelog_item_reports WHERE request_id = o.id) THEN
    aviso := format('Report #%s marcado como concluído sem nenhum item de changelog ligado — entrega sem rastro em rodada.', num);
  END IF;

  INSERT INTO mcp_write_audit(actor_id, tool, report_numero, input, changes)
  VALUES (v_actor, 'update_report_management', num, p, jsonb_build_object('mudancas', mud, 'aviso', aviso));
  RETURN jsonb_build_object('report', num, 'mudancas', mud, 'aviso', aviso);
END $$;

-- permissões de execução
DO $$ DECLARE f text; BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public._mcp_check_keys(jsonb,text[],text)','public._mcp_date(jsonb,text,text,boolean)','public._mcp_text(jsonb,text,text,boolean)',
    'public._mcp_enum(jsonb,text,text,text[])','public._mcp_int(jsonb,text,text)','public._mcp_require_super_admin()',
    'public._mcp_check_sort(uuid)','public._mcp_insert_item(uuid,jsonb,text)','public._mcp_link(uuid,jsonb,text,uuid,uuid)',
    'public.mcp_create_changelog_round(jsonb)','public.mcp_update_changelog_round(jsonb)','public.mcp_link_reports(jsonb)','public.mcp_update_report_management(jsonb)']
  LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f); END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.mcp_create_changelog_round(jsonb), public.mcp_update_changelog_round(jsonb),
  public.mcp_link_reports(jsonb), public.mcp_update_report_management(jsonb) TO authenticated;