# Número sequencial legível para solicitações de curadoria

## 1. Geração do número

Migração em `public.curation_requests`:

- Nova coluna `numero_sequencial INTEGER`.
- Sequence dedicada `public.curation_requests_numero_seq` (global, um único contador para todo o sistema).
- Coluna com `DEFAULT nextval(...)`, `NOT NULL` e índice `UNIQUE`.
- Sem trigger: o `DEFAULT` da sequence já cobre todo insert (formulário avulso, report do chat, futuros inserts). Sequence é à prova de concorrência e nunca reaproveita número.
- `ALTER SEQUENCE ... OWNED BY` para o número morrer junto com a coluna caso a tabela seja removida.

## 2. Backfill dos 35 existentes

Na mesma migração, antes de tornar a coluna obrigatória:

1. Numerar todas as linhas atuais por `ROW_NUMBER() OVER (ORDER BY created_at ASC, id ASC)` — ordem cronológica de criação, com o `id` só como desempate estável.
2. `setval` da sequence para o maior número atribuído, de modo que o próximo report criado receba #36.
3. Só então aplicar `NOT NULL` + `UNIQUE`.

Nada mais é tocado: `duplicate_of`, `changelog_item_reports`, MCP e o restante continuam usando o UUID.

## 3. Onde aparece na interface

Formato adotado: **`#12`** como marcador curto ao lado do título nas listas, e **`Solicitação nº 12`** nos cabeçalhos de detalhe — o curto não polui a tabela, o longo deixa claro no detalhe o que se copia para o WhatsApp.

- `/app/curadoria` (curador)
  - Lista: `#12` em fonte monoespaçada discreta antes do título de cada card.
  - Sheet de detalhe: `Solicitação nº 12` no título, com botão de copiar já existente no padrão da tela (ou texto selecionável, se não houver).
  - Após criar um report: o toast/confirmação passa a citar o número recém-gerado.
- `/app/admin/curadoria` (super admin)
  - Tabela: nova primeira coluna `Nº` com `#12`.
  - Drawer de detalhe: `Solicitação nº 12` no cabeçalho, junto ao status.

## Detalhes técnicos

- Os `select(...)` do Supabase em `src/routes/app.curadoria.index.tsx` e `src/routes/app.admin.curadoria.tsx` ganham `numero_sequencial`; os tipos locais (`CurationRow`, `CurationAdminRow`) ganham o campo `number`.
- `createCurationRequest` em `src/lib/curation.functions.ts` passa a retornar `numero_sequencial` no `.select("id, numero_sequencial")` para o toast de sucesso.
- Nenhuma alteração em RLS, grants, MCP ou changelog.
