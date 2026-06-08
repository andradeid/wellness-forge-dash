import { createFileRoute } from "@tanstack/react-router";
import { ChatMessageList, type ChatMessage } from "@/components/chat/ChatMessageList";

export const Route = createFileRoute("/debug-render")({
  component: DebugRender,
});

const mockMessages: ChatMessage[] = [
  {
    id: "1",
    role: "assistant",
    content: `## Análise Clínica de Resultados

Com base nos exames laboratoriais fornecidos, observamos alguns pontos importantes que merecem atenção na sua conduta nutricional.

### Principais Marcadores Alterados

*   **Vitamina D (25-hidroxivitamina D):** 22 ng/mL (Valor de referência: > 30 ng/mL)
*   **Ferritina:** 15 ng/mL (Valor de referência: 30 - 200 ng/mL)
*   **Glicemia de Jejum:** 105 mg/dL (Valor de referência: < 99 mg/dL)

---

### Recomendações Estratégicas

1.  **Suplementação de Vitamina D:** Sugere-se a reposição com 50.000 UI/semana por 8 semanas, seguida de manutenção.
2.  **Ajuste na Ingestão de Ferro:** Aumentar o consumo de fontes de ferro heme (carnes vermelhas) associadas a fontes de Vitamina C para otimizar a absorção.
3.  **Controle Glicêmico:** Reduzir a carga glicêmica das refeições e priorizar carboidratos complexos e fibras.

**Observação importante:** É fundamental realizar um novo controle em 60 dias para avaliar a eficácia das intervenções.`,
  },
];

function DebugRender() {
  return (
    <div className="min-h-screen bg-slate-50 p-10 flex justify-center">
      <div className="w-full max-w-3xl">
        <ChatMessageList messages={mockMessages} thinking={false} />
      </div>
    </div>
  );
}
