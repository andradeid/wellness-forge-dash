import { auth, defineMcp } from "@lovable.dev/mcp-js";
import getContextTool from "./tools/get-context";
import listReportsTool from "./tools/list-reports";
import getReportTool from "./tools/get-report";
import getBaselineTool from "./tools/get-baseline";
import getConversationTool from "./tools/get-conversation";
import listChangelogTool from "./tools/list-changelog";
import getChangelogTool from "./tools/get-changelog";



// O issuer OAuth precisa ser o host direto do Supabase. VITE_SUPABASE_PROJECT_ID
// é inlinado pelo Vite em build-time; o fallback só mantém a URL bem-formada
// durante a extração do manifesto.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "lumma-2-0-nutripro-dashboard",
  title: "Lumma 2.0 NutriPro Dashboard",
  version: "1.0.0",
  instructions:
    "Servidor MCP SOMENTE LEITURA do sistema de curadoria da Lumma (nutrição clínica funcional). Nenhuma tool cria, altera ou apaga dados. Comece sempre por `get_context`, que devolve o manual completo do sistema (classificações suporte/melhoria/requer_analise_humana, o que é a baseline e o dicionário de campos). Depois use `get_baseline` como fonte da verdade, `list_reports` e `get_report` para os relatos (com print em base64) e `get_conversation` para a conversa clínica original de um report. Acesso restrito a usuários Lumma com papel curator ou super_admin; a direção técnica interna só é exposta a super admins.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [
    getContextTool,
    getBaselineTool,
    listReportsTool,
    getReportTool,
    getConversationTool,
    listChangelogTool,
    getChangelogTool,
  ],


});
