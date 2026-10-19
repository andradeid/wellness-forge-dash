import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fillSubscriptionOrigin, type SubscriptionOriginClient, type SubscriptionOrigin } from "./subscription-origin";
import { createUserWithTempPassword } from "./user-provisioning.server";

function originClient(initial: string | null) {
  let value = initial;
  let failure: { message: string } | null = null;
  const client: SubscriptionOriginClient = {
    from(table) {
      assert.equal(table, "subscriptions");
      return { update(patch) {
        return { eq(column, id) {
          assert.equal(column, "user_id");
          assert.equal(id, "test-user");
          return { async or(filter) {
            assert.equal(filter, 'origin.is.null,origin.eq.""');
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
      assert.equal(state.value(), origin);
    });
  }
  it("preenche string vazia", async () => {
    const state = originClient("");
    await fillSubscriptionOrigin(state.client, "test-user", "stripe");
    assert.equal(state.value(), "stripe");
  });
  for (const origin of ["migracao_lumma1", "interno", "manual", "hubla", "sorteio", "importacao"]) {
    it(`preserva ${origin} na renovação Stripe`, async () => {
      const state = originClient(origin);
      await fillSubscriptionOrigin(state.client, "test-user", "stripe");
      assert.equal(state.value(), origin);
    });
  }
  it("preserva a primeira origem em chamadas concorrentes", async () => {
    const state = originClient(null);
    await Promise.all([
      fillSubscriptionOrigin(state.client, "test-user", "kiwify"),
      fillSubscriptionOrigin(state.client, "test-user", "stripe"),
    ]);
    assert.equal(state.value(), "kiwify");
  });
  it("reporta falha de gravação", async () => {
    const state = originClient(null);
    state.fail();
    await assert.rejects(fillSubscriptionOrigin(state.client, "test-user", "manual"), /indisponível/);
    assert.equal(state.value(), null);
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
      assert.equal(result.userId, "test-user");
      assert.equal(result.welcomeNeeded, false);
      assert.equal(state.value(), supplied ?? "manual");
    });
  }
});