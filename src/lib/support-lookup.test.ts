import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildLookupResponse, samePhone, type LookupAccount } from "./support-lookup";

const NOW = new Date("2026-11-25T12:00:00Z");
const conta = (p: Partial<LookupAccount> = {}): LookupAccount => ({
  email: "fulana@exemplo.com",
  phone: "5511991580024",
  isBlocked: false,
  deleted: false,
  lastSignInAt: null,
  mustChangePassword: true,
  subscription: { status: "active", planType: "legado_500", origin: "migracao_lumma1", currentPeriodEnd: "2027-07-23T23:59:59Z", unlimitedCredits: false },
  planName: "Legado 500",
  credits: { balance: 487, monthlyQuota: 500, packBalance: 0, quotaResetAt: "2026-12-10T03:00:00Z" },
  ...p,
});

describe("samePhone", () => {
  it("mesmo número com e sem +55, com e sem o 9", () => {
    assert.equal(samePhone("+5511991580024", "11991580024"), true);
    assert.equal(samePhone("556392318976", "(63) 99231-8976"), true); // WhatsApp sem o 9
    assert.equal(samePhone("+55 11 99158-0024", "5511991580024"), true);
  });
  it("número diferente, DDD diferente ou sem DDD não confere", () => {
    assert.equal(samePhone("+5511991580025", "5511991580024"), false);
    assert.equal(samePhone("+5521991580024", "5511991580024"), false);
    assert.equal(samePhone("+5511991580024", "991580024"), false);
    assert.equal(samePhone("+5511991580024", null), false);
  });
});

describe("buildLookupResponse — privacidade", () => {
  it("conta não encontrada", () => {
    const r = buildLookupResponse(null, "+5511991580024", NOW);
    assert.equal(r.encontrada, false);
    assert.match(r.orientacao, /outro e-mail/);
  });

  it("telefone não confere: só existe + primeiro acesso, sem plano nem créditos", () => {
    const r = buildLookupResponse(conta(), "+5521900000000", NOW);
    assert.equal(r.encontrada, true);
    assert.equal(r.primeiro_acesso_feito, false);
    assert.equal(r.telefone_confere, false);
    assert.equal(r.plano, undefined);
    assert.equal(r.creditos, undefined);
    assert.equal(r.valida_ate, undefined);
    assert.match(r.orientacao, /primeiro acesso/);
  });

  it("telefone confere: plano, validade e créditos", () => {
    const r = buildLookupResponse(conta({ lastSignInAt: "2026-11-20T10:00:00Z" }), "+5511991580024", NOW);
    assert.equal(r.telefone_confere, true);
    assert.equal(r.primeiro_acesso_feito, true);
    assert.equal(r.plano, "Legado 500");
    assert.equal(r.situacao, "ativa");
    assert.equal(r.valida_ate, "2027-07-23");
    assert.deepEqual(r.creditos, { saldo: 487, cota_mensal: 500, avulsos: 0, renova_em: "2026-12-10" });
    assert.equal(r.origem, "Migrada da Lumma 1 / Black 2025");
  });

  it("situações: vencida, pagamento pendente, cancelada, sem plano", () => {
    const ph = "+5511991580024";
    assert.equal(buildLookupResponse(conta({ subscription: { ...conta().subscription!, currentPeriodEnd: "2026-07-11T00:00:00Z" } }), ph, NOW).situacao, "vencida");
    assert.equal(buildLookupResponse(conta({ subscription: { ...conta().subscription!, status: "past_due" } }), ph, NOW).situacao, "pagamento_pendente");
    assert.equal(buildLookupResponse(conta({ subscription: { ...conta().subscription!, status: "canceled" } }), ph, NOW).situacao, "cancelada");
    const semPlano = buildLookupResponse(conta({ subscription: null }), ph, NOW);
    assert.equal(semPlano.situacao, "sem_plano");
    assert.match(semPlano.orientacao, /transfira/);
  });

  it("conta bloqueada ou apagada", () => {
    const b = buildLookupResponse(conta({ isBlocked: true }), "+5511991580024", NOW);
    assert.equal(b.conta_bloqueada, true);
    assert.equal(b.plano, undefined);
    assert.match(b.orientacao, /bloqueada/);
    assert.equal(buildLookupResponse(conta({ deleted: true }), "+5511991580024", NOW).encontrada, false);
  });

  it("nunca devolve telefone nem e-mail da conta", () => {
    const r = JSON.stringify(buildLookupResponse(conta(), "+5511991580024", NOW));
    assert.equal(r.includes("991580024"), false);
    assert.equal(r.includes("fulana@"), false);
  });
});
