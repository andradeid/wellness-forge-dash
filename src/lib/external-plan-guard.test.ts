import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isExternalPaymentEventId, shouldKeepExternalPlan } from "./external-plan-guard";

const now = new Date("2026-11-21T14:48:52Z");

describe("aviso da Stripe x compra fora da Stripe", () => {
  it("caso real: Kiwify 2 anos em 16/11, Stripe mensal termina 21/11 → mantém a Kiwify", () => {
    assert.equal(shouldKeepExternalPlan({
      localStatus: "active", localPeriodEnd: "2028-11-16T01:58:33Z",
      stripePeriodEnd: "2026-11-21T14:48:15Z", stripeStartedAt: "2026-10-21T14:48:15Z",
      externalPaidAt: "2026-11-16T01:58:33Z", now,
    }), true);
  });

  it("sem compra fora da Stripe → segue a Stripe", () => {
    assert.equal(shouldKeepExternalPlan({
      localStatus: "active", localPeriodEnd: "2026-12-21T00:00:00Z",
      stripePeriodEnd: "2026-11-21T14:48:15Z", stripeStartedAt: "2026-10-21T00:00:00Z",
      externalPaidAt: null, now,
    }), false);
  });

  it("compra externa antiga, antes da assinatura Stripe → segue a Stripe", () => {
    assert.equal(shouldKeepExternalPlan({
      localStatus: "active", localPeriodEnd: "2027-06-01T00:00:00Z",
      stripePeriodEnd: "2026-11-21T00:00:00Z", stripeStartedAt: "2026-10-21T00:00:00Z",
      externalPaidAt: "2025-06-01T00:00:00Z", now,
    }), false);
  });

  it("validade local já vencida ou menor que a da Stripe → segue a Stripe", () => {
    const base = { localStatus: "active", stripeStartedAt: "2026-10-21T00:00:00Z", externalPaidAt: "2026-11-16T00:00:00Z", now };
    assert.equal(shouldKeepExternalPlan({ ...base, localPeriodEnd: "2026-11-20T00:00:00Z", stripePeriodEnd: "2026-12-21T00:00:00Z" }), false);
    assert.equal(shouldKeepExternalPlan({ ...base, localPeriodEnd: "2026-12-01T00:00:00Z", stripePeriodEnd: "2026-12-21T00:00:00Z" }), false);
  });

  it("local já cancelado → segue a Stripe", () => {
    assert.equal(shouldKeepExternalPlan({
      localStatus: "canceled", localPeriodEnd: "2028-11-16T00:00:00Z",
      stripePeriodEnd: "2026-11-21T00:00:00Z", stripeStartedAt: "2026-10-21T00:00:00Z",
      externalPaidAt: "2026-11-16T00:00:00Z", now,
    }), false);
  });

  it("id de evento externo", () => {
    assert.equal(isExternalPaymentEventId("kiwify:abc:order_approved:2026-11-15 22:58"), true);
    assert.equal(isExternalPaymentEventId("evt_1UT0oSIjJyqfQCaT"), false);
    assert.equal(isExternalPaymentEventId(null), false);
  });
});
