import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeSupportOrigin, supportMessage, supportWhatsAppUrl, SUPPORT_WHATSAPP_NUMBER } from "./support-links";

test("número novo", () => {
  assert.equal(SUPPORT_WHATSAPP_NUMBER, "5561995132079");
  assert.ok(supportWhatsAppUrl().startsWith("https://wa.me/5561995132079?text="));
});

test("botão do sistema diz que veio do sistema e leva o e-mail", () => {
  const url = supportWhatsAppUrl("sistema", "ana@x.com");
  const text = decodeURIComponent(url.split("?text=")[1]);
  assert.match(text, /botão de suporte do sistema Lumma/);
  assert.match(text, /Meu e-mail de acesso: ana@x\.com/);
});

test("link /suporte = Instagram por padrão", () => {
  assert.equal(normalizeSupportOrigin(null), "instagram");
  assert.match(supportMessage("instagram"), /link do Instagram/);
});

test("origem livre vira etiqueta segura", () => {
  assert.equal(normalizeSupportOrigin("Stories Black!"), "stories-black");
  assert.equal(normalizeSupportOrigin("<script>"), "script");
  assert.match(supportMessage("site"), /\(site\)/);
});

test("e-mail de vencimento", () => {
  assert.match(supportMessage("email"), /e-mail da Lumma/);
});
