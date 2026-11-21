import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fileProblemFromError, fileProblemText, PDF_PASSWORD_TEXT } from "./dify-stream-guards";

describe("PDF que o Dify não consegue abrir", () => {
  it("caso real: PDF com senha", () => {
    const raw =
      "Failed to extract text from PDF: Failed to load document (PDFium: Incorrect password error).";
    assert.equal(fileProblemFromError(raw), "pdf_password");
    assert.equal(fileProblemText("pdf_password"), PDF_PASSWORD_TEXT);
  });
  it("PDF ilegível sem ser senha", () => {
    assert.equal(
      fileProblemFromError("Failed to extract text from PDF: Failed to load document (PDFium: Data format error)."),
      "pdf_unreadable",
    );
  });
  it("outros erros seguem a mensagem genérica", () => {
    assert.equal(fileProblemFromError("Workflow run ID not found"), null);
    assert.equal(fileProblemFromError("503 concurrent requests"), null);
    assert.equal(fileProblemFromError(""), null);
    assert.equal(fileProblemFromError(null), null);
  });
});

import { isProviderCreditExhausted, isProviderConcurrencyError } from "./dify-error-messages";

describe("provedor de IA sem crédito", () => {
  it("caso real 20/11: OpenAI sem crédito", () => {
    const raw =
      "[models] Rate Limit Error, Error code: 429 - {'error': {'message': 'You have no credits remaining. Add credits to continue using the API at https://platform.openai.com/settings/organization/billing/.', 'type': 'insufficient_quota', 'param': None, 'code': 'credit_balance_exhausted'}}";
    assert.equal(isProviderCreditExhausted(raw), true);
  });
  it("Anthropic sem crédito", () => {
    assert.equal(isProviderCreditExhausted("Your credit balance is too low to access the Anthropic API"), true);
  });
  it("pico de uso não é falta de crédito", () => {
    assert.equal(isProviderCreditExhausted("503 Too many concurrent requests"), false);
    assert.equal(isProviderConcurrencyError("503 Too many concurrent requests"), true);
    assert.equal(isProviderCreditExhausted("Rate limit reached for requests per min (RPM)"), false);
    assert.equal(isProviderCreditExhausted(null), false);
  });
});
