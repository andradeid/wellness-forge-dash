import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Changelog das rodadas semanais de ajustes da curadoria.
 *
 * Segurança:
 * - Somente `curator` ou `super_admin` (checado sob RLS com o token do usuário).
 * - A projeção é feita NO SERVIDOR: `camada`, `classificacao` e
 *   `descricao_tecnica` nunca são enviados ao cliente de um curador.
 * - O UUID do report também não trafega para o curador — apenas o título e a
 *   marcação de que a solicitação é dele.
 */

export interface ChangelogLinkedReport {
  /** Só presente para super admin (o curador não recebe UUID cru). */
  id?: string;
  title: string;
  /** Verdadeiro quando o report foi criado pelo próprio usuário. */
  mine: boolean;
}

export interface ChangelogItemView {
  id: string;
  descricao_legivel: string;
  /** 'suporte' | 'melhoria' — usado para separar ✅ / 🆕. */
  tipo: "suporte" | "melhoria";
  reports: ChangelogLinkedReport[];
  /** Campos técnicos: somente super admin. */
  camada?: string;
  descricao_tecnica?: string | null;
}

export interface ChangelogRoundView {
  id: string;
  rodada_data: string;
  titulo: string;
  itens: ChangelogItemView[];
}

interface RawItem {
  id: string;
  round_id: string;
  descricao_legivel: string;
  classificacao: "suporte" | "melhoria";
  camada: string;
  descricao_tecnica: string | null;
  sort_order: number;
}

export const getChangelogRounds = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ isFull: boolean; rounds: ChangelogRoundView[] }> => {
    const supabase = context.supabase as any;

    const [{ data: isSuperAdmin }, { data: isCurator }] = await Promise.all([
      supabase.rpc("has_role", { _user_id: context.userId, _role: "super_admin" }),
      supabase.rpc("has_role", { _user_id: context.userId, _role: "curator" }),
    ]);

    if (!isSuperAdmin && !isCurator) throw new Response("Forbidden", { status: 403 });
    const isFull = !!isSuperAdmin;

    const { data: rounds, error: roundsError } = await supabase
      .from("changelog_rounds")
      .select("id, rodada_data, titulo")
      .order("rodada_data", { ascending: false });
    if (roundsError) throw new Response(roundsError.message, { status: 400 });

    const roundList = (rounds ?? []) as Array<{ id: string; rodada_data: string; titulo: string }>;
    if (roundList.length === 0) return { isFull, rounds: [] };

    const { data: items, error: itemsError } = await supabase
      .from("changelog_items")
      .select("id, round_id, descricao_legivel, classificacao, camada, descricao_tecnica, sort_order")
      .in(
        "round_id",
        roundList.map((r) => r.id),
      )
      .order("sort_order", { ascending: true });
    if (itemsError) throw new Response(itemsError.message, { status: 400 });

    const itemList = (items ?? []) as RawItem[];

    // Vínculos com os reports (título + dono), para o selo do curador.
    const linksByItem = new Map<string, ChangelogLinkedReport[]>();
    if (itemList.length > 0) {
      const { data: links } = await supabase
        .from("changelog_item_reports")
        .select("item_id, request_id, curation_requests(id, title, created_by)")
        .in(
          "item_id",
          itemList.map((i) => i.id),
        );

      for (const link of (links ?? []) as any[]) {
        const request = link.curation_requests;
        if (!request) continue;
        const list = linksByItem.get(link.item_id) ?? [];
        list.push({
          ...(isFull ? { id: request.id as string } : {}),
          title: (request.title as string) ?? "Solicitação",
          mine: request.created_by === context.userId,
        });
        linksByItem.set(link.item_id, list);
      }
    }

    return {
      isFull,
      rounds: roundList.map((round) => ({
        id: round.id,
        rodada_data: round.rodada_data,
        titulo: round.titulo,
        itens: itemList
          .filter((item) => item.round_id === round.id)
          .map((item) => ({
            id: item.id,
            descricao_legivel: item.descricao_legivel,
            tipo: item.classificacao,
            reports: linksByItem.get(item.id) ?? [],
            ...(isFull
              ? { camada: item.camada, descricao_tecnica: item.descricao_tecnica }
              : {}),
          })),
      })),
    };
  });
