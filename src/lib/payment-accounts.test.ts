import { describe, it } from "node:test";
import assert from "node:assert/strict";
import Stripe from "stripe";
import { parseTokenList, tokenMatches } from "./webhook-tokens.server";
import { getStripeAccounts, verifyStripeWebhook } from "./stripe.server";

describe("tokens de webhook com conta antiga e nova", () => {
  it("um token só funciona como antes", () => {
    assert.equal(tokenMatches("abc", "abc"), true);
    assert.equal(tokenMatches("abd", "abc"), false);
  });
  it("aceita qualquer um da lista (nova,antiga)", () => {
    assert.deepEqual(parseTokenList(" nova , antiga ,"), ["nova", "antiga"]);
    assert.equal(tokenMatches("antiga", "nova,antiga"), true);
    assert.equal(tokenMatches("nova", "nova,antiga"), true);
    assert.equal(tokenMatches("outra", "nova,antiga"), false);
  });
  it("recusa token vazio e configuração vazia", () => {
    assert.equal(tokenMatches("", "abc"), false);
    assert.equal(tokenMatches(null, "abc"), false);
    assert.equal(tokenMatches("abc", ""), false);
    assert.equal(tokenMatches("abc", undefined), false);
  });
});

describe("contas Stripe", () => {
  it("só a principal quando não há conta antiga", () => {
    const a = getStripeAccounts({ STRIPE_SECRET_KEY: "sk_test_novo", STRIPE_WEBHOOK_SECRET: "whsec_novo" });
    assert.deepEqual(a.map((x) => x.name), ["principal"]);
  });
  it("principal e antiga, principal primeiro; antiga igual à principal é ignorada", () => {
    const env = { STRIPE_SECRET_KEY: "sk_test_novo", STRIPE_WEBHOOK_SECRET: "whsec_novo", STRIPE_SECRET_KEY_ANTIGA: "sk_test_velho", STRIPE_WEBHOOK_SECRET_ANTIGA: "whsec_velho" };
    assert.deepEqual(getStripeAccounts(env).map((x) => [x.name, x.webhookSecret]), [["principal", "whsec_novo"], ["antiga", "whsec_velho"]]);
    assert.equal(getStripeAccounts({ ...env, STRIPE_SECRET_KEY_ANTIGA: "sk_test_novo" }).length, 1);
  });

  it("webhook: aceita aviso da conta nova e da antiga e diz de qual veio", async () => {
    const accounts = getStripeAccounts({ STRIPE_SECRET_KEY: "sk_test_novo", STRIPE_WEBHOOK_SECRET: "whsec_novo", STRIPE_SECRET_KEY_ANTIGA: "sk_test_velho", STRIPE_WEBHOOK_SECRET_ANTIGA: "whsec_velho" });
    const body = JSON.stringify({ id: "evt_1", object: "event", type: "invoice.paid", data: { object: {} } });
    const sign = (secret: string) => Stripe.webhooks.generateTestHeaderString({ payload: body, secret });

    const daNova = await verifyStripeWebhook(body, sign("whsec_novo"), accounts);
    assert.equal(daNova?.account, "principal");
    assert.equal(daNova?.event.id, "evt_1");

    const daAntiga = await verifyStripeWebhook(body, sign("whsec_velho"), accounts);
    assert.equal(daAntiga?.account, "antiga");

    assert.equal(await verifyStripeWebhook(body, sign("whsec_de_outro"), accounts), null);
    // Sem a conta antiga configurada, o aviso dela é recusado (o problema de hoje).
    assert.equal(await verifyStripeWebhook(body, sign("whsec_velho"), accounts.slice(0, 1)), null);
  });
});
