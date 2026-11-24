import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fileProblemFromError, fileProblemText, hasMixedPdfAndImage, PDF_PASSWORD_TEXT } from "./dify-stream-guards";

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

describe("PDF e foto na mesma mensagem", () => {
  it("erro real do Dify vira mensagem de arquivos misturados", () => {
    assert.equal(fileProblemFromError("Unsupported Extension Type: .jpeg"), "mixed_files");
    assert.match(fileProblemText("mixed_files"), /PDF e foto/);
  });
  it("detecta a mistura antes de enviar", () => {
    const pdf = { type: "application/pdf", name: "exame.pdf" };
    const jpg = { type: "image/jpeg", name: "pagina.jpeg" };
    assert.equal(hasMixedPdfAndImage([pdf, pdf, jpg, jpg]), true);
    assert.equal(hasMixedPdfAndImage([pdf, pdf]), false);
    assert.equal(hasMixedPdfAndImage([jpg, { type: "", name: "foto.PNG" }]), false);
    assert.equal(hasMixedPdfAndImage([{ type: "", name: "laudo.PDF" }, { type: "", name: "x.jpg" }]), true);
  });
});
