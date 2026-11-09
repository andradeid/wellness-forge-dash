/**
 * Detecta, no stream SSE do Dify, se a RESPOSTA trouxe o array de marcadores
 * preenchido (`"markers": [ {`).
 *
 * O Dify envia a resposta em pedaços pequenos, cada um dentro de um evento
 * `data: {"event":"message","answer":"..."}`. Procurar o padrão nos bytes
 * brutos falha quase sempre (o trecho vem quebrado entre eventos) — por isso
 * montamos o texto da resposta a partir do campo `answer` e procuramos nele.
 */
const MARKERS_RX = /"markers"\s*:\s*\[\s*\{/;
/** Quanto do fim da resposta montada guardamos para achar o padrão quebrado. */
const TAIL = 400;
/** Linha SSE gigante sem quebra (ex.: node_finished com saída enorme): limite de segurança. */
const MAX_LINE_BUFFER = 2_000_000;

export function createMarkersDetector() {
  let lineBuf = "";
  let answerTail = "";
  let found = false;

  /** Recebe o texto já decodificado do stream; devolve true quando achou os marcadores. */
  return function feed(piece: string): boolean {
    if (found) return true;
    lineBuf += piece;
    let nl: number;
    while ((nl = lineBuf.indexOf("\n")) >= 0) {
      const line = lineBuf.slice(0, nl).trim();
      lineBuf = lineBuf.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      const json = line.slice(5).trim();
      if (!json.startsWith("{") || !json.includes('"answer"')) continue;
      let ev: { event?: string; answer?: unknown };
      try {
        ev = JSON.parse(json);
      } catch {
        continue;
      }
      if ((ev.event === "message" || ev.event === "agent_message") && typeof ev.answer === "string") {
        answerTail = (answerTail + ev.answer).slice(-TAIL);
        if (MARKERS_RX.test(answerTail)) {
          found = true;
          lineBuf = "";
          return true;
        }
      }
    }
    if (lineBuf.length > MAX_LINE_BUFFER) lineBuf = lineBuf.slice(-MAX_LINE_BUFFER / 10);
    return false;
  };
}
