import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { analyzedFileNames } from "./analyzed-files";

const user = (names: string[]) => ({ role: "user", attachments: names.map((name) => ({ name })) });
const ok = { role: "assistant", structured_data: { error: false } };
const fail = { role: "assistant", structured_data: { error: true } };

describe("analyzedFileNames", () => {
  it("conta o arquivo quando a análise respondeu sem erro", () => {
    assert.deepEqual([...analyzedFileNames([user(["Laudo.pdf"]), ok])], ["laudo.pdf"]);
  });

  it("não conta quando a análise falhou (nada foi cobrado)", () => {
    assert.equal(analyzedFileNames([user(["Hemograma.jpeg", "Laudo.pdf"]), fail]).size, 0);
  });

  it("não conta enquanto a resposta ainda não chegou", () => {
    assert.equal(analyzedFileNames([user(["Laudo.pdf"])]).size, 0);
  });

  it("falhou e depois foi reenviado com sucesso: passa a contar", () => {
    const msgs = [user(["Vit D.jpeg"]), fail, user(["Vit D.jpeg"]), ok];
    assert.deepEqual([...analyzedFileNames(msgs)], ["vit d.jpeg"]);
  });

  it("ignora mensagens sem anexo e nomes vazios", () => {
    assert.equal(analyzedFileNames([{ role: "user" }, ok, user([""]), ok]).size, 0);
  });
});
