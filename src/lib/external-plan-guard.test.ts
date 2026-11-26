import { describe, expect, it } from "vitest";
import { isExternalPaymentEventId, shouldKeepExternalPlan } from "./external-plan-guard";

const now = new Date("2026-11-21T14:48:52Z");

describe("aviso da Stripe x compra fora da Stripe", () => {
  it("caso real: Kiwify 2 anos em 16/11, Stripe mensal termina 21/11 → mantém a Kiwify", () => {
    expect(shouldKeepExternalPlan({
      localStatus: "active", localPeriodEnd: "2028-11-16T01:58:33Z",
      stripePeriodEnd: "2026-11-21T14:48:15Z", stripeStartedAt: "2026-10-21T14:48:15Z",
      externalPaidAt: "2026-11-16T01:58:33Z", now,
    })).toBe(true);
  });

  it("sem compra fora da Stripe → segue a Stripe", () => {
    expect(shouldKeepExternalPlan({
      localStatus: "active", localPeriodEnd: "2026-12-21T00:00:00Z",
      stripePeriodEnd: "2026-11-21T14:48:15Z", stripeStartedAt: "2026-10-21T00:00:00Z",
      externalPaidAt: null, now,
    })).toBe(false);
  });

  it("compra externa antiga, antes da assinatura Stripe → segue a Stripe", () => {
    expect(shouldKeepExternalPlan({
      localStatus: "active", localPeriodEnd: "2027-06-01T00:00:00Z",
      stripePeriodEnd: "2026-11-21T00:00:00Z", stripeStartedAt: "2026-10-21T00:00:00Z",
      externalPaidAt: "2025-06-01T00:00:00Z", now,
    })).toBe(false);
  });

  it("validade local já vencida ou menor que a da Stripe → segue a Stripe", () => {
    const base = { localStatus: "active", stripeStartedAt: "2026-10-21T00:00:00Z", externalPaidAt: "2026-11-16T00:00:00Z", now };
    expect(shouldKeepExternalPlan({ ...base, localPeriodEnd: "2026-11-20T00:00:00Z", stripePeriodEnd: "2026-12-21T00:00:00Z" })).toBe(false);
    expect(shouldKeepExternalPlan({ ...base, localPeriodEnd: "2026-12-01T00:00:00Z", stripePeriodEnd: "2026-12-21T00:00:00Z" })).toBe(false);
  });

  it("local já cancelado → segue a Stripe", () => {
    expect(shouldKeepExternalPlan({
      localStatus: "canceled", localPeriodEnd: "2028-11-16T00:00:00Z",
      stripePeriodEnd: "2026-11-21T00:00:00Z", stripeStartedAt: "2026-10-21T00:00:00Z",
      externalPaidAt: "2026-11-16T00:00:00Z", now,
    })).toBe(false);
  });

  it("id de evento externo", () => {
    expect(isExternalPaymentEventId("kiwify:abc:order_approved:2026-11-15 22:58")).toBe(true);
    expect(isExternalPaymentEventId("evt_1UT0oSIjJyqfQCaT")).toBe(false);
    expect(isExternalPaymentEventId(null)).toBe(false);
  });
});
