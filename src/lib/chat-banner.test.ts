import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { chatBannerKind, LONG_CHAT_THRESHOLD } from "./chat-banner";

const now = new Date("2026-11-18T20:00:00Z");
const recente = new Date("2026-11-18T19:00:00Z");
const antiga = new Date("2026-11-16T19:00:00Z");

describe("aviso no topo da conversa", () => {
  it("conversa curta e recente: sem aviso", () => {
    assert.equal(chatBannerKind({ messageCount: 10, lastAt: recente, now }), null);
  });
  it("a partir de 60 mensagens: aviso de conversa longa", () => {
    assert.equal(
      chatBannerKind({ messageCount: LONG_CHAT_THRESHOLD - 1, lastAt: recente, now }),
      null,
    );
    assert.equal(
      chatBannerKind({ messageCount: LONG_CHAT_THRESHOLD, lastAt: recente, now }),
      "longa",
    );
    assert.equal(chatBannerKind({ messageCount: 93, lastAt: null, now }), "longa");
  });
  it("parada há mais de 24h: aviso de inativa", () => {
    assert.equal(chatBannerKind({ messageCount: 10, lastAt: antiga, now }), "inativa");
  });
  it("longa e parada: prevalece o de conversa longa", () => {
    assert.equal(chatBannerKind({ messageCount: 93, lastAt: antiga, now }), "longa");
  });
});
