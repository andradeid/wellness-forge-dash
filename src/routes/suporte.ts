import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { normalizeSupportOrigin, supportWhatsAppUrl } from "@/lib/support-links";

/**
 * Link público de suporte: lumma.ia.br/suporte → WhatsApp do suporte com a mensagem
 * "Vim pelo link do Instagram da Lumma…". Para outra origem: /suporte?origem=site
 * (a mensagem passa a dizer "(site)"). Não exige login e não passa pela tela de manutenção.
 */
export const Route = createFileRoute("/suporte")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const origem = normalizeSupportOrigin(new URL(request.url).searchParams.get("origem"));
        return new Response(null, {
          status: 302,
          headers: {
            Location: supportWhatsAppUrl(origem),
            "Cache-Control": "no-store",
          },
        });
      },
    },
  },
});
