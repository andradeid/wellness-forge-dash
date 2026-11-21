import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeBrWhatsapp, parseWhatsappList } from "./admin-alerts-whatsapp.server";
import { detectAiProvider, isProviderCreditExhausted } from "./dify-error-messages";

describe("WhatsApp dos alertas", () => {
  it("aceita número com DDD em vários formatos", () => {
    assert.equal(normalizeBrWhatsapp("61994009368"), "+5561994009368");
    assert.equal(normalizeBrWhatsapp("(61) 99400-9368"), "+5561994009368");
    assert.equal(normalizeBrWhatsapp("+55 61 99400-9368"), "+5561994009368");
    assert.equal(normalizeBrWhatsapp("9400-9368"), null);
  });
  it("lista sem repetidos", () => {
    assert.deepEqual(parseWhatsappList("61994009368\n+55 61 99400-9368\n\n11 98765-4321"), [
      "+5561994009368",
      "+5511987654321",
    ]);
    assert.deepEqual(parseWhatsappList(null), []);
  });
});

describe("qual provedor ficou sem crédito", () => {
  it("OpenAI (caso real 20/11)", () => {
    assert.equal(
      detectAiProvider("[models] Rate Limit Error, Error code: 429 - {'error': {'message': 'You have no credits remaining. Add credits to continue using the API at https://platform.openai.com/settings/organization/billing/.', 'type': 'insufficient_quota'}}"),
      "OpenAI",
    );
  });
  it("Anthropic", () => {
    assert.equal(detectAiProvider("Your credit balance is too low to access the Anthropic API"), "Anthropic");
  });
  it("Gemini sem cobrança ativa entra na trava; limite de uso não", () => {
    const billing = "[gemini] 403 PERMISSION_DENIED: This API method requires billing to be enabled. BILLING_DISABLED";
    assert.equal(detectAiProvider(billing), "Gemini");
    assert.equal(isProviderCreditExhausted(billing), true);
    assert.equal(isProviderCreditExhausted("[gemini] 429 RESOURCE_EXHAUSTED: Quota exceeded for requests per minute"), false);
  });
});
