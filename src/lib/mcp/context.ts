/**
 * Manual do sistema de curadoria, servido pela tool `get_context`.
 * É o que torna o MCP portátil: qualquer IA lê isto e entende o sistema
 * sem contexto externo.
 */
export const CURATION_MANUAL = `# Manual do Sistema de Curadoria da Lumma

Você está conectado ao sistema de curadoria da Lumma via MCP (somente leitura). Este manual explica o que é o sistema e como interpretar os dados. Leia antes de analisar qualquer report.

## O que é a Lumma

Lumma é um SaaS de nutrição clínica funcional (protocolos do Instituto Ana Paula Pujol — IAPP). O sistema tem agentes de IA (super agentes: masculino, feminino, gestante monofetal, gestante gemelar, e um agente de pesquisa científica) que analisam exames laboratoriais, geram formulações magistrais, receituários, análise de composição corporal e mais. O front é feito em Lovable; os agentes rodam em Dify; o banco é Supabase.

## O que é a curadoria

Curadoras clínicas testam o sistema e reportam problemas. Cada report é uma "solicitação de curadoria". O objetivo do sistema é classificar cada solicitação como suporte ou melhoria, para separar o que é correção (coberta por contrato) do que é escopo novo (pago).

## As três classificações (o conceito central)

A classificação compara o relato com a BASELINE (ver abaixo):

- **suporte**: a funcionalidade EXISTIA na entrega (baseline: existia = "sim") e parou de funcionar ou funciona errado. É correção.
- **melhoria**: a funcionalidade NÃO existia na entrega (baseline: existia = "nao"). É escopo novo.
- **requer_analise_humana**: zona cinza — a funcionalidade existia mas com qualidade discutível, OU o relato toca itens com estados diferentes na baseline, OU a baseline não cobre o caso com clareza. Nestes casos, NÃO classifique categoricamente; recomende análise humana.

## O que é a BASELINE

A baseline (\`get_baseline\`) é o retrato congelado do sistema na entrega do contrato (versão 1.0, 29/07/2026). É a fonte da verdade objetiva. Cada item diz se uma funcionalidade existia na entrega e onde. Campos:

- **area**: agrupador (ex: "Exame de Sangue", "Formulações e Receita")
- **funcionalidade**: o que é
- **existia**: sim | nao | parcial (o dado decisivo para classificar)
- **camada**: dify (prompt do agente) | lovable (interface) | banco (Supabase) — onde a funcionalidade mora
- **comportamento_tecnico**: como se comportava na entrega
- **legivel**: descrição em linguagem clínica

**Regra de ouro**: para classificar um report, encontre a funcionalidade correspondente na baseline e use o campo \`existia\`. Sempre ancore a justificativa na baseline (cite a funcionalidade e o que ela diz).

## Como ler um report (dicionário de campos)

- **title, description**: o relato do curador.
- **curator_classification**: o que o CURADOR achou (suporte/melhoria) — ele classifica às cegas, antes da IA. Pode divergir da classificação da IA; isso é esperado e útil.
- **curator_dimension**: comportamento | tabela_dado | formatacao | clinico | outro.
- **ai_classification, ai_confidence, ai_justification**: o que a IA classificou e por quê.
- **ai_technical_direction**: direção técnica de como resolver (camada, tipo de ajuste prompt/kb/interface, sugestão, o que verificar antes, ideias extras). INTERNO — só super admin. Se você recebeu este campo, você tem acesso de super admin.
- **curator_agreement**: se o curador concordou ou discordou da IA. Divergência = ponto que precisa de decisão humana.
- **duplicate_of**: se preenchido, este report é duplicata de outro.
- **status**: registrado | em_analise | aprovado_ajuste | classificado_melhoria | em_desenvolvimento | concluido.
- **agent_key, chat_id, message_id, patient_id**: contexto de onde o report nasceu (qual agente, qual conversa). Use \`get_conversation\` para ver a conversa original.
- **list_changelog**: Lista as rodadas semanais de ajustes (entregas) feitas em produção.
- **get_changelog**: Obtém o detalhe completo de uma rodada de ajustes específica.
- **has_image / imagem**: reports podem ter print anexado (via \`get_report\`, vem embutido em base64).



## Como você deve trabalhar (se for propor ajustes)

1. Leia os reports (\`list_reports\`), filtre por status/data conforme pedido.
2. Para cada um, compare com a baseline (\`get_baseline\`) e confirme a classificação.
3. Para os que forem suporte ou melhoria aprovada, use a \`ai_technical_direction\` (se super admin) como ponto de partida — mas ela é sugestão, não ordem.
4. Se precisar do contexto, use \`get_conversation\` (a conversa que gerou o report) e \`get_report\` (a imagem).
5. Ao propor ajuste de agente (YAML/prompt) ou KB: PROPONHA, nunca afirme como pronto. A publicação em agente clínico é sempre revisada e feita por humano. Mudança em agente clínico pode afetar segurança do paciente — trate com o cuidado correspondente.

## Cuidados

- Este é um sistema clínico. Ajustes errados podem afetar orientações a pacientes (incluindo gestantes). Priorize segurança sobre velocidade.
- A baseline é imutável. Se um report revelar que a baseline está incompleta, sinalize — não invente que um item existe.
- Zona cinza sempre recua para análise humana. Não seja categórico quando a baseline não for clara.

## Sobre este MCP

O acesso exige login OAuth como usuário Lumma com papel \`curator\` ou \`super_admin\`. Curadores veem apenas os próprios reports e não recebem \`ai_technical_direction\`; super admins veem tudo. Visualizações de conversa original ficam registradas em trilha de auditoria.

### O que pode ser escrito (somente super_admin — curador não escreve nada)

- \`create_changelog_round\`: cria uma rodada com todos os itens (e ligações a reports) numa única transação.
- \`update_changelog_round\`: corrige uma rodada pelo id — campos da rodada e dos itens, itens novos e, só se pedido por id, itens apagados (o conteúdo integral do item apagado fica na auditoria).
- \`link_report_to_item\`: liga ou remove a ligação entre item de changelog e report. Remover desfaz só a associação.
- \`update_report_management\`: altera apenas \`status\`, \`admin_final_classification\`, \`grupo_tematico\` e \`admin_notes\` de um report.

### O que continua intocável — nenhuma tool alcança, por nenhum caminho

- **Baseline** (\`baseline_items\`): imutável. É a referência contratual de suporte versus melhoria.
- **Relato do curador**: \`title\`, \`description\`, \`curator_classification\`, \`curator_dimension\`.
- **Análise automática**: \`ai_classification\`, \`ai_confidence\`, \`ai_justification\`, \`ai_technical_direction\` e demais campos \`ai_*\`.
- Estrutura de tabelas, políticas de acesso e triggers.

### Garantias

- Valores fora da lista são recusados com o campo e o valor. Nada é normalizado nem convertido.
- Campos não previstos são recusados pelo nome, não ignorados.
- Nenhuma escrita dispara notificação, e-mail ou publicação. Tornar visível à curadoria continua sendo ação humana.
- Toda escrita fica registrada em \`mcp_write_audit\` (quem, quando, ferramenta, número do report, id da rodada, pedido e antes/depois), sem possibilidade de alteração ou exclusão.
`;
