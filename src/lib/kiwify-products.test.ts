import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { KIWIFY_PRODUCTS, kiwifyValidityLabel } from "./kiwify-products";

describe("catálogo de produtos Kiwify", () => {
  it("libera Pro com validade de 2 anos para o produto da Black Friday", () => {
    assert.deepEqual(KIWIFY_PRODUCTS["c1df6360-d3b5-11f1-aaf7-2ffa08014d49"], {
      slug: "pro",
      cycle: "yearly",
      years: 2,
    });
  });

  it("mantém os produtos antigos com validade de 1 ano", () => {
    assert.equal(KIWIFY_PRODUCTS["a19b7600-851a-11f1-ac2c-dbf6162aa415"].years, 1);
    assert.equal(KIWIFY_PRODUCTS["59a89e30-851b-11f1-be44-db22545a0013"].years, 1);
    assert.equal(KIWIFY_PRODUCTS["53f6ae60-89d9-11f1-be8a-11fc729f7dc2"].years, 1);
  });

  it("não reconhece um produto fora do catálogo", () => {
    assert.equal(KIWIFY_PRODUCTS["00000000-0000-0000-0000-000000000000"], undefined);
  });

  it("escreve a validade em português", () => {
    assert.equal(kiwifyValidityLabel(1), "Anual");
    assert.equal(kiwifyValidityLabel(2), "2 anos");
  });
});
