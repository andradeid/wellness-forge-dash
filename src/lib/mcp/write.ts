/**
 * Base comum das tools de ESCRITA do MCP.
 *
 * Toda a validação de fronteira (campos aceitos, enums, sort_order, existência
 * de reports, papel super_admin, auditoria) vive nas funções do banco
 * `mcp_*` — que rodam em uma única transação. Aqui só garantimos que o
 * chamador é super_admin antes de chamar e repassamos o JSON intacto, sem
 * normalizar nada.
 */
import type { ToolContext } from "@lovable.dev/mcp-js";
import { McpAuthError, requireCurationAccess, toolError } from "./auth";

type WriteRpc =
  | "mcp_create_changelog_round"
  | "mcp_update_changelog_round"
  | "mcp_link_reports"
  | "mcp_update_report_management";

export async function runWrite(ctx: ToolContext, rpc: WriteRpc, payload: unknown) {
  try {
    const caller = await requireCurationAccess(ctx);
    if (!caller.isSuperAdmin) {
      throw new McpAuthError("Acesso negado: escrita no MCP é exclusiva de super_admin.");
    }
    // Cast: as funções novas podem ainda não constar nos tipos gerados.
    const rpcCall = caller.supabase.rpc as unknown as (
      fn: string,
      args: { p: unknown },
    ) => Promise<{ data: unknown; error: { message: string } | null }>;
    const { data, error } = await rpcCall.call(caller.supabase, rpc, { p: payload });
    if (error) throw new Error(error.message);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
      structuredContent: { resultado: data as Record<string, unknown> },
    };
  } catch (error) {
    return toolError(error);
  }
}
