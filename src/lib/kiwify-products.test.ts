import { describe, expect, it } from "vitest";
import { KIWIFY_PRODUCTS, kiwifyValidityLabel } from "./kiwify-products";

describe("catálogo de produtos Kiwify", () => {
  it("libera Pro com validade de 2 anos para o produto da Black Friday", () => {
    expect(KIWIFY_PRODUCTS["c1df6360-d3b5-11f1-aaf7-2ffa08014d49"]).toEqual({
      slug: "pro",
      cycle: "yearly",
      years: 2,
    });
  });

  it("mantém os produtos antigos com validade de 1 ano", () => {
    expect(KIWIFY_PRODUCTS["a19b7600-851a-11f1-ac2c-dbf6162aa415"].years).toBe(1);
    expect(KIWIFY_PRODUCTS["59a89e30-851b-11f1-be44-db22545a0013"].years).toBe(1);
    expect(KIWIFY_PRODUCTS["53f6ae60-89d9-11f1-be8a-11fc729f7dc2"].years).toBe(1);
  });

  it("não reconhece um produto fora do catálogo", () => {
    expect(KIWIFY_PRODUCTS["00000000-0000-0000-0000-000000000000"]).toBeUndefined();
  });

  it("escreve a validade em português", () => {
    expect(kiwifyValidityLabel(1)).toBe("Anual");
    expect(kiwifyValidityLabel(2)).toBe("2 anos");
  });
});
