import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeHublaGraceEnd, endOfDayBrasilia } from "./hubla-grace";

const now = new Date("2026-11-18T16:34:30Z");
const base = {
  invoiceStatus: "unpaid",
  dueDate: "2026-11-27T02:44:00.000Z", // 26/11 23:44 em Brasília
  hasSubscription: true,
  subStatus: "active",
  currentPeriodEnd: "2026-11-18T15:34:29Z",
  now,
};

describe("carência Hubla", () => {
  it("caso real (Mayra): estende até o fim do dia do vencimento em Brasília", () => {
    assert.equal(computeHublaGraceEnd(base), "2026-11-27T02:59:59.000Z");
  });

  it("fim do dia em Brasília", () => {
    assert.equal(
      endOfDayBrasilia("2026-11-26T15:00:00Z").toISOString(),
      "2026-11-27T02:59:59.000Z",
    );
  });

  it("ignora fatura paga, vencida ou sem assinatura", () => {
    assert.equal(computeHublaGraceEnd({ ...base, invoiceStatus: "paid" }), null);
    assert.equal(computeHublaGraceEnd({ ...base, invoiceStatus: "overdue" }), null);
    assert.equal(computeHublaGraceEnd({ ...base, hasSubscription: false }), null);
  });

  it("não reativa assinatura parada há mais de 7 dias", () => {
    assert.equal(computeHublaGraceEnd({ ...base, currentPeriodEnd: "2026-11-01T00:00:00Z" }), null);
  });

  it("nunca encurta o período", () => {
    assert.equal(computeHublaGraceEnd({ ...base, currentPeriodEnd: "2026-12-18T00:00:00Z" }), null);
  });

  it("limita a 10 dias a partir de agora", () => {
    const r = computeHublaGraceEnd({ ...base, dueDate: "2026-12-30T12:00:00Z" });
    assert.equal(r, new Date(now.getTime() + 10 * 86400000).toISOString());
  });

  it("vencimento já passado ou data inválida: nada", () => {
    assert.equal(computeHublaGraceEnd({ ...base, dueDate: "2026-11-17T12:00:00Z" }), null);
    assert.equal(computeHublaGraceEnd({ ...base, dueDate: "xx" }), null);
  });

  it("assinatura cancelada não ganha carência", () => {
    assert.equal(computeHublaGraceEnd({ ...base, subStatus: "cancelled" }), null);
  });
});
