import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { boughtBlackFriday, campaignActive, hasLongAccess } from "./black-friday-popup";

describe("popup Black Friday", () => {
  it("fica ativa até o fim de 30/11 em Brasília", () => {
    assert.equal(campaignActive(new Date("2026-11-30T23:00:00-03:00")), true);
    assert.equal(campaignActive(new Date("2026-12-01T00:01:00-03:00")), false);
  });
  it("não aparece para quem já comprou pela TMB ou Kiwify", () => {
    assert.equal(boughtBlackFriday([{ status: "paid", metadata: { tmb_produto: "nova-nutricionista" } }]), true);
    assert.equal(boughtBlackFriday([{ status: "paid", metadata: { kiwify_product_id: "c1df6360-d3b5-11f1-aaf7-2ffa08014d49" } }]), true);
    assert.equal(boughtBlackFriday([{ status: "refunded", metadata: { tmb_produto: "nova-nutricionista" } }]), false);
    assert.equal(boughtBlackFriday([{ status: "paid", metadata: { plan_slug: "starter" } }]), false);
    assert.equal(boughtBlackFriday([]), false);
  });
  it("não aparece para quem já tem acesso longo (liberação manual da Black)", () => {
    const now = new Date("2026-11-09T12:00:00Z");
    assert.equal(hasLongAccess("2028-11-08T23:59:59Z", now), true);
    assert.equal(hasLongAccess("2027-10-26T00:00:00Z", now), false);
    assert.equal(hasLongAccess(null, now), false);
    assert.equal(hasLongAccess("2127-06-22T00:00:00Z", now), false);
  });
});
