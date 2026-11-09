import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { salvageMarkersArray } from "./marker-salvage";

describe("salvageMarkersArray", () => {
  it("descarta só o marcador com JSON quebrado e mantém os demais", () => {
    const t = '{"markers":[{"name":"Hemoglobina","value":"13,2"},{"name":"analysis":"N/L = 3,18","value":"3,18"},{"name":"HDL","value":"54","analysis":"com } e \\"aspas\\""}]}';
    assert.deepEqual(salvageMarkersArray(t)?.map((m) => m.name), ["Hemoglobina", "HDL"]);
  });
  it("aproveita o que veio antes de uma resposta cortada", () => {
    assert.equal(salvageMarkersArray('{"markers":[{"name":"A","value":"1"},{"name":"B","val')?.length, 1);
  });
  it("retorna null sem marcadores", () => {
    assert.equal(salvageMarkersArray("texto sem json"), null);
  });
});
