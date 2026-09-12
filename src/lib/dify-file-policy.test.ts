import { describe, expect, it } from "vitest";
import { taskConsumesFiles } from "./dify-file-policy";

describe("taskConsumesFiles", () => {
  it.each([
    "exam_fem",
    "bioimpedancia",
    "composicao_corporal_foto",
    "exam",
    "composition",
  ])("permite anexos para %s", (task) => {
    expect(taskConsumesFiles(task)).toBe(true);
  });

  it.each(["production", "reasoning", "formulacao_magistral", "research"])(
    "remove anexos de %s",
    (task) => {
      expect(taskConsumesFiles(task)).toBe(false);
    },
  );

  it("falha de forma segura quando a tarefa não foi informada", () => {
    expect(taskConsumesFiles(null)).toBe(false);
    expect(taskConsumesFiles(undefined)).toBe(false);
  });
});