import { describe, expect, it } from "bun:test";
import { fillSubscriptionOrigin, type SubscriptionOriginClient, type SubscriptionOrigin } from "./subscription-origin";
import { createUserWithTempPassword } from "./user-provisioning.server";

function originClient(initial: string | null) {
  let value = initial;
  let failure: { message: string } | null = null;
  const client: SubscriptionOriginClient = {
    from(table) {
      expect(table).toBe("subscriptions");
      return { update(patch) {
        return { eq(column, id) {
          expect(column).toBe("user_id");
          expect(id).toBe("test-user");
          return { async or(filter) {
            expect(filter).toBe('origin.is.null,origin.eq.""');
            if (!failure && (value === null || value === "")) value = patch.origin;
            return { error: failure };
          } };
        } };
      } };
    },
  };
  return { client, value: () => value, fail: () => { failure = { message: "indisponível" }; } };
}

describe("origem das assinaturas", () => {
  for (const origin of ["kiwify", "stripe", "manual", "importacao"] as const) {
    it(`preenche NULL com ${origin}`, async () => {
      const state = originClient(null);
      await fillSubscriptionOrigin(state.client, "test-user", origin);
      expect(state.value()).toBe(origin);
    });
  }
  it("preenche string vazia", async () => {
    const state = originClient("");
    await fillSubscriptionOrigin(state.client, "test-user", "stripe");
    expect(state.value()).toBe("stripe");
  });
  for (const origin of ["migracao_lumma1", "interno", "manual", "hubla", "sorteio", "importacao"]) {
    it(`preserva ${origin} na renovação Stripe`, async () => {
      const state = originClient(origin);
      await fillSubscriptionOrigin(state.client, "test-user", "stripe");
      expect(state.value()).toBe(origin);
    });
  }
  it("preserva a primeira origem em chamadas concorrentes", async () => {
    const state = originClient(null);
    await Promise.all([
      fillSubscriptionOrigin(state.client, "test-user", "kiwify"),
      fillSubscriptionOrigin(state.client, "test-user", "stripe"),
    ]);
    expect(state.value()).toBe("kiwify");
  });
  it("reporta falha de gravação", async () => {
    const state = originClient(null);
    state.fail();
    await expect(fillSubscriptionOrigin(state.client, "test-user", "manual")).rejects.toThrow("indisponível");
    expect(state.value()).toBeNull();
  });
});

describe("provisionamento compartilhado", () => {
  for (const supplied of [undefined, "stripe", "kiwify"] as const) {
    it(`usa ${supplied ?? "manual"} sem rotular compras como manuais`, async () => {
      const state = originClient(null);
      const client = {
        auth: { admin: { updateUserById: async () => ({ error: null }) } },
        from(table: string) {
          if (table === "subscriptions") return state.client.from("subscriptions");
          return {
            select: () => ({ ilike: () => ({ maybeSingle: async () => ({ data: { id: "test-user" } }) }) }),
            update: () => ({ eq: async () => ({ error: null }) }),
          };
        },
      };
      const result = await createUserWithTempPassword(client, {
        email: "example@example.invalid", origin: supplied as SubscriptionOrigin | undefined,
      });
      expect(result.userId).toBe("test-user");
      expect(result.welcomeNeeded).toBe(false);
      expect(state.value()).toBe(supplied ?? "manual");
    });
  }
});