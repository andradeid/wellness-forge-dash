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
