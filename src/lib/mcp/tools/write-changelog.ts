import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { runWrite } from "../write";

// Objetos aninhados usam passthrough: campos desconhecidos chegam ao banco,
// que os RECUSA nomeando o campo (em vez de descartá-los em silêncio).
const item = z
  .object({
    descricao_legivel: z.string(),
    classificacao: z.string().describe("suporte | melhoria | infra"),
    camada: z.string().describe("dify | lovable | banco | kb"),
    descricao_tecnica: z.string().optional(),
    item_data: z.string().describe("AAAA-MM-DD, obrigatório"),
    sort_order: z.number().int().describe("1..N sequencial dentro da rodada"),
    reports: z.array(z.number().int()).optional().describe("Números sequenciais de reports a ligar."),
  })
  .passthrough();

const WRITE = { readOnlyHint: false, idempotentHint: false, openWorldHint: false } as const;

export const createChangelogRoundTool = defineTool({
  name: "create_changelog_round",
  title: "Criar rodada de changelog",
  description:
    "SOMENTE super_admin. Cria uma rodada e todos os itens (e ligações a reports) em UMA transação — se algo falhar, nada é gravado. Recusa rodada_data já existente, enums fora da lista, item_data ausente e sort_order que não seja 1..N. Não envia notificação.",
  inputSchema: {
    titulo: z.string(),
    rodada_data: z.string().describe("AAAA-MM-DD, única"),
    rodada_data_fim: z.string().optional(),
    notas_curador: z.string().optional(),
    notas_admin: z.string().optional(),
    itens: z.array(item).min(1),
  },
  annotations: { ...WRITE, destructiveHint: false },
  handler: (input, ctx) => runWrite(ctx, "mcp_create_changelog_round", input),
});

export const updateChangelogRoundTool = defineTool({
  name: "update_changelog_round",
  title: "Corrigir rodada de changelog",
  description:
    "SOMENTE super_admin. Corrige uma rodada pelo round_id (nunca por título): campos da rodada, campos de itens existentes, itens novos e, só se pedido explicitamente por id, itens a apagar (o conteúdo completo do item apagado fica na auditoria). Revalida enums e sort_order 1..N. Retorna antes/depois campo a campo. Tudo em uma transação.",
  inputSchema: {
    round_id: z.string(),
    rodada: z
      .object({
        titulo: z.string().optional(),
        rodada_data: z.string().optional(),
        rodada_data_fim: z.string().nullable().optional(),
        notas_curador: z.string().nullable().optional(),
        notas_admin: z.string().nullable().optional(),
      })
      .passthrough()
      .optional(),
    itens_alterar: z
      .array(
        z
          .object({
            id: z.string(),
            descricao_legivel: z.string().optional(),
            classificacao: z.string().optional(),
            camada: z.string().optional(),
            descricao_tecnica: z.string().nullable().optional(),
            item_data: z.string().optional(),
            sort_order: z.number().int().optional(),
          })
          .passthrough(),
      )
      .optional(),
    itens_novos: z.array(item).optional(),
    itens_apagar: z.array(z.string()).optional().describe("IDs de itens a apagar desta rodada."),
  },
  annotations: { ...WRITE, destructiveHint: true },
  handler: (input, ctx) => runWrite(ctx, "mcp_update_changelog_round", input),
});

export const linkReportToItemTool = defineTool({
  name: "link_report_to_item",
  title: "Ligar ou remover ligação report ↔ item",
  description:
    "SOMENTE super_admin. acao='ligar' cria ligações item↔report (retorna 'ja_existia' se já houver); acao='remover' desfaz a associação (retorna 'nao_existia' se não houver). Remover não apaga report nem item. Recusa report inexistente dizendo o número. Várias ligações por chamada, em uma transação.",
  inputSchema: {
    acao: z.string().describe("ligar | remover"),
    ligacoes: z
      .array(z.object({ item_id: z.string(), report: z.number().int() }).passthrough())
      .min(1),
  },
  annotations: { ...WRITE, destructiveHint: true },
  handler: (input, ctx) => runWrite(ctx, "mcp_link_reports", input),
});

export const updateReportManagementTool = defineTool({
  name: "update_report_management",
  title: "Atualizar gestão de um report",
  description:
    "SOMENTE super_admin. Altera APENAS status, admin_final_classification (suporte | melhoria | requer_analise_humana | null), grupo_tematico e admin_notes de um report, pelo número sequencial. Nenhum outro campo é alcançável. Se status virar 'concluido' sem item de changelog ligado, grava e retorna aviso.",
  inputSchema: {
    report: z.number().int(),
    status: z
      .string()
      .optional()
      .describe("registrado | em_analise | aprovado_ajuste | classificado_melhoria | em_desenvolvimento | concluido"),
    admin_final_classification: z.string().nullable().optional(),
    grupo_tematico: z.string().nullable().optional(),
    admin_notes: z.string().nullable().optional(),
  },
  annotations: { ...WRITE, destructiveHint: false },
  handler: (input, ctx) => runWrite(ctx, "mcp_update_report_management", input),
});
