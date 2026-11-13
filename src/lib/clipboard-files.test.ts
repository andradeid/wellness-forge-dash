import { test } from "node:test";
import assert from "node:assert/strict";
import { filesFromClipboard, isGenericPastedName, namePastedFiles } from "./clipboard-files";

function clip(opts: { text?: string; files?: File[]; onlyFilesList?: boolean }) {
  const files = opts.files ?? [];
  return {
    getData: (t: string) => (t === "text/plain" ? opts.text ?? "" : ""),
    items: (opts.onlyFilesList ? [] : files.map((f) => ({ kind: "file", type: f.type, getAsFile: () => f }))) as any,
    files: files as any,
  };
}

const png = (name = "image.png") => new File([new Uint8Array([1, 2, 3])], name, { type: "image/png" });
const pdf = (name = "laudo.pdf") => new File([new Uint8Array([4])], name, { type: "application/pdf" });

test("print colado vira anexo", () => {
  const out = filesFromClipboard(clip({ files: [png()] }));
  assert.equal(out.length, 1);
});

test("texto puro: não anexa nada (cola o texto)", () => {
  assert.equal(filesFromClipboard(clip({ text: "TSH 2,1" })).length, 0);
});

test("Excel/Word (texto + foto do trecho): cola o texto, não anexa a foto", () => {
  assert.equal(filesFromClipboard(clip({ text: "Hemoglobina\t13,2", files: [png()] })).length, 0);
});

test("navegador que só preenche files", () => {
  assert.equal(filesFromClipboard(clip({ files: [pdf()], onlyFilesList: true })).length, 1);
});

test("clipboard vazio/nulo", () => {
  assert.equal(filesFromClipboard(null).length, 0);
  assert.equal(filesFromClipboard(clip({})).length, 0);
});

test("prints com o mesmo nome ganham nomes únicos", () => {
  const now = new Date(2026, 10, 13, 14, 5, 9);
  const out = namePastedFiles([png(), png()], [], now);
  assert.equal(out[0].name, "imagem-colada-20261113-140509.png");
  assert.equal(out[1].name, "imagem-colada-20261113-140509-2.png");
  assert.equal(out[0].type, "image/png");
  assert.equal(out[0].size, 3);
});

test("não repete nome já anexado", () => {
  const now = new Date(2026, 10, 13, 14, 5, 9);
  const out = namePastedFiles([png()], ["imagem-colada-20261113-140509.png"], now);
  assert.equal(out[0].name, "imagem-colada-20261113-140509-2.png");
});

test("arquivo com nome de verdade fica como está", () => {
  const f = pdf("exame-joana.pdf");
  assert.equal(namePastedFiles([f])[0], f);
});

test("nome real repetido ganha sufixo", () => {
  const out = namePastedFiles([pdf("laudo.pdf")], ["laudo.pdf"]);
  assert.equal(out[0].name, "laudo-2.pdf");
});

test("nomes genéricos", () => {
  assert.ok(isGenericPastedName("image.png"));
  assert.ok(isGenericPastedName(""));
  assert.ok(!isGenericPastedName("print-exame.png"));
});
