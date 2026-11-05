import assert from "node:assert/strict";
import { test } from "node:test";
import {
  LUMMA_PLAY_NEVER_KEY,
  setLummaPlayNeverShow,
  shouldShowLummaPlayAnnouncement,
} from "./lumma-play-announcement.ts";

function withFakeStorage(run: (store: Map<string, string>) => void) {
  const store = new Map<string, string>();
  const fake = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  const previous = (globalThis as { localStorage?: unknown }).localStorage;
  (globalThis as { localStorage?: unknown }).localStorage = fake;
  try {
    run(store);
  } finally {
    (globalThis as { localStorage?: unknown }).localStorage = previous;
  }
}

test("abre o aviso em todo acesso enquanto ninguém marcou 'não mostrar novamente'", () => {
  withFakeStorage(() => {
    assert.equal(shouldShowLummaPlayAnnouncement(), true);
  });
});

test("marca 'não mostrar novamente' e o aviso deixa de abrir", () => {
  withFakeStorage((store) => {
    setLummaPlayNeverShow(true);
    assert.equal(store.get(LUMMA_PLAY_NEVER_KEY), "1");
    assert.equal(shouldShowLummaPlayAnnouncement(), false);
  });
});

test("desmarcar 'não mostrar novamente' faz o aviso abrir de novo", () => {
  withFakeStorage((store) => {
    setLummaPlayNeverShow(true);
    setLummaPlayNeverShow(false);
    assert.equal(store.has(LUMMA_PLAY_NEVER_KEY), false);
    assert.equal(shouldShowLummaPlayAnnouncement(), true);
  });
});

test("sem localStorage disponível o aviso continua abrindo", () => {
  const previous = (globalThis as { localStorage?: unknown }).localStorage;
  (globalThis as { localStorage?: unknown }).localStorage = undefined;
  try {
    assert.equal(shouldShowLummaPlayAnnouncement(), true);
    setLummaPlayNeverShow(true);
  } finally {
    (globalThis as { localStorage?: unknown }).localStorage = previous;
  }
});
