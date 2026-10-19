export type SubscriptionOrigin = "kiwify" | "stripe" | "manual" | "importacao";

export interface SubscriptionOriginClient {
  from(table: "subscriptions"): {
    update(values: { origin: SubscriptionOrigin }): {
      eq(column: "user_id", value: string): {
        or(filter: string): PromiseLike<{ error: { message: string } | null }>;
      };
    };
  };
}

/** A condição é avaliada no banco, inclusive em chamadas concorrentes. */
export async function fillSubscriptionOrigin(
  client: SubscriptionOriginClient,
  userId: string,
  origin: SubscriptionOrigin,
): Promise<void> {
  const { error } = await client.from("subscriptions")
    .update({ origin })
    .eq("user_id", userId)
    .or('origin.is.null,origin.eq.""');
  if (error) throw new Error(`Não foi possível registrar a origem da assinatura: ${error.message}`);
}