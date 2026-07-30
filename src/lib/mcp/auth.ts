/**
 * Autorização das tools do MCP.
 *
 * Toda tool exige token OAuth válido + papel `curator` ou `super_admin`,
 * verificado contra o banco (has_role) usando o token do próprio chamador.
 */
import type { ToolContext } from "@lovable.dev/mcp-js";
import { supabaseForUser } from "./supabase";

export interface McpCaller {
  userId: string;
  isSuperAdmin: boolean;
  supabase: ReturnType<typeof supabaseForUser>;
}

export class McpAuthError extends Error {}

/**
 * Garante que o chamador está autenticado e é curador ou super admin.
 * Lança McpAuthError caso contrário — as tools convertem em resposta de erro.
 */
export async function requireCurationAccess(ctx: ToolContext): Promise<McpCaller> {
  if (!ctx.isAuthenticated()) {
    throw new McpAuthError("Não autenticado. Conecte-se com uma conta Lumma autorizada.");
  }

  const userId = ctx.getUserId();
  if (!userId) throw new McpAuthError("Token sem identificação de usuário.");

  const supabase = supabaseForUser(ctx);

  const [{ data: isSuperAdmin }, { data: isCurator }] = await Promise.all([
    supabase.rpc("has_role", { _user_id: userId, _role: "super_admin" }),
    supabase.rpc("has_role", { _user_id: userId, _role: "curator" }),
  ]);

  if (!isSuperAdmin && !isCurator) {
    throw new McpAuthError(
      "Acesso negado. Este MCP é restrito a usuários com papel 'curator' ou 'super_admin' na Lumma.",
    );
  }

  return { userId, isSuperAdmin: !!isSuperAdmin, supabase };
}

/** Converte qualquer falha em um resultado de erro legível para a IA. */
export function toolError(error: unknown) {
  const message =
    error instanceof McpAuthError
      ? error.message
      : error instanceof Error
        ? error.message
        : "Erro inesperado ao consultar o sistema de curadoria.";
  return { content: [{ type: "text" as const, text: message }], isError: true };
}
