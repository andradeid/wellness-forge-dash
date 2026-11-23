import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isRerankBillingError, ragVerdict } from "./rag-health.server";

describe("alerta da base de conhecimento (Cohere)", () => {
  it("caso real 23/11: busca simples traz 5, com Cohere volta 0 → falhando", () => {
    assert.equal(ragVerdict({ plain: 5, reranked: 0 }), "rerank_failing");
  });
  it("erro na chamada com reranqueador → falhando", () => {
    assert.equal(ragVerdict({ plain: 3, reranked: null, error: "HTTP 400" }), "rerank_failing");
  });
  it("tudo respondendo → ok", () => {
    assert.equal(ragVerdict({ plain: 3, reranked: 3 }), "ok");
  });
  it("a própria busca falhou (base/embedding) → não culpa a Cohere", () => {
    assert.equal(ragVerdict({ plain: null, reranked: null }), "inconclusive");
    assert.equal(ragVerdict({ plain: 0, reranked: 0 }), "inconclusive");
  });
  it("reconhece erro de cobrança da Cohere", () => {
    assert.equal(isRerankBillingError("Please add or update your payment method"), true);
    assert.equal(isRerankBillingError("HTTP 500: Internal Server Error"), false);
  });
});
