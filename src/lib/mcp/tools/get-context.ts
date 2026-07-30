import { defineTool } from "@lovable.dev/mcp-js";
import { CURATION_MANUAL } from "../context";

export default defineTool({
  name: "get_context",
  title: "Manual do sistema de curadoria",
  description:
    "Retorna o manual completo do sistema de curadoria da Lumma em texto: o que é a Lumma, o que é curadoria, o significado das classificações (suporte, melhoria, requer_analise_humana), o que é a baseline e o dicionário de cada campo dos reports. SEMPRE chame esta tool primeiro, antes de analisar qualquer report.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, destructiveHint: false, openWorldHint: false },
  handler: () => ({ content: [{ type: "text", text: CURATION_MANUAL }] }),
});
