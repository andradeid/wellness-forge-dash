import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseTmbOrder, reaisToCents, redactTmbPayload, resolveTmbProduct, tmbEventKey, TMB_PRODUCTS } from "./tmb";

const exemplo = {
  produtor: "Lumma", lancamento: "A Nova Nutricionista - Black Friday", pedido: 123456,
  status_pedido: "Efetivado", cliente: "Maria Teste", documento: "000.000.000-00",
  email: "Maria@Exemplo.com ", valor_principal: 997.0, parcelas: 12, valor_total: 1290.5,
  data_efetivado: "2026-11-09 10:15:00", telefones: "61999990000, 61988880000", telefone_ativo: "",
  endereco_completo: "Rua X", nascimento: "1990-01-01", score: 700, titulo: "Nova Nutri",
};

describe("TMB — catálogo", () => {
  it("A Nova Nutricionista libera Starter por 2 anos", () => {
    const p = TMB_PRODUCTS["nova-nutricionista"];
    assert.equal(p.slug, "starter");
    assert.equal(p.years, 2);
  });
  it("reconhece o produto pela chave da URL ou pelo nome do lançamento", () => {
    const o = parseTmbOrder(exemplo);
    assert.equal(resolveTmbProduct("nova-nutricionista", o)?.key, "nova-nutricionista");
    assert.equal(resolveTmbProduct(null, o)?.key, "nova-nutricionista");
    assert.equal(resolveTmbProduct("outro-produto", o), null);
    assert.equal(resolveTmbProduct(null, { lancamento: "Curso de Bolo", titulo: null }), null);
  });
});

describe("TMB — leitura do pedido", () => {
  it("lê pedido, status, e-mail, nome, telefone e valor", () => {
    const o = parseTmbOrder(exemplo);
    assert.equal(o.pedido, "123456");
    assert.equal(o.status, "efetivado");
    assert.equal(o.email, "maria@exemplo.com");
    assert.equal(o.nome, "Maria Teste");
    assert.equal(o.telefone, "61999990000");
    assert.equal(o.valorCents, 99700);
    assert.equal(o.parcelas, 12);
  });
  it("entende Cancelado e status desconhecido", () => {
    assert.equal(parseTmbOrder({ ...exemplo, status_pedido: "CANCELADO" }).status, "cancelado");
    assert.equal(parseTmbOrder({ ...exemplo, status_pedido: "Aguardando" }).status, "outro");
  });
  it("converte reais para centavos", () => {
    assert.equal(reaisToCents(997), 99700);
    assert.equal(reaisToCents("1.234,56"), 123456);
    assert.equal(reaisToCents("1234.56"), 123456);
    assert.equal(reaisToCents(null), 0);
  });
  it("chave de idempotência por pedido e status", () => {
    assert.equal(tmbEventKey(parseTmbOrder(exemplo)), "tmb:123456:efetivado");
  });
  it("não guarda CPF, endereço, nascimento nem score", () => {
    const r = redactTmbPayload(exemplo);
    for (const k of ["documento", "endereco_completo", "nascimento", "score", "telefones"]) assert.equal(k in r, false, k);
    assert.equal(r.email, exemplo.email);
  });
});
