import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { classifyRawDifyError } from "./dify-error-log.server";

describe("classificação do registro de erros", () => {
  it("OpenAI sem crédito vira provider_credits (não 'alta demanda')", () => {
    assert.equal(
      classifyRawDifyError("Error code: 429 - {'type': 'insufficient_quota', 'code': 'credit_balance_exhausted'}"),
      "provider_credits",
    );
  });
  it("429 comum continua rate_limit; quota de pico continua high_demand", () => {
    assert.equal(classifyRawDifyError("Too many requests", 429), "rate_limit");
    assert.equal(classifyRawDifyError("RESOURCE_EXHAUSTED: quota per minute"), "high_demand");
  });
  it("PDF com senha continua leitura de arquivo", () => {
    assert.equal(classifyRawDifyError("Failed to extract text from PDF: (PDFium: Incorrect password error)."), "file_read");
  });
});
