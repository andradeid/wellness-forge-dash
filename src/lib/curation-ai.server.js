/**
 * Classificador de curadoria (OpenAI) — SOMENTE servidor.
 *
 * Regras de segurança/robustez:
 * - A chave vive apenas em `process.env.OPENAI_API_KEY`; nenhuma chamada parte do navegador.
 * - Este módulo NUNCA lança para o fluxo de criação: qualquer falha vira `ai_status = 'failed'`.
 * - A direção técnica gravada aqui é exclusiva do painel super admin.
 */
export const CURATION_CLASSIFIER_SYSTEM_PROMPT = `Você é o Classificador de Curadoria da Lumma, um sistema de nutrição clínica. 
Sua função tem DUAS partes, nesta ordem: (1) detectar se o relato já foi 
reportado antes, e (2) classificar o relato como suporte ou melhoria, comparando 
com a BASELINE (o que o sistema fazia na entrega).

Você receberá:
- BASELINE: lista de funcionalidades do sistema na entrega, cada uma com: area, 
  funcionalidade, existia (sim/nao/parcial), camada (dify/lovable/banco), 
  comportamento_tecnico, legivel.
- REPORTS_EXISTENTES: solicitações já registradas (com id, título, descrição, 
  status, classificação).
- NOVO_RELATO: o relato do curador a ser analisado (título, descrição, 
  classificação que o curador escolheu, e imagem se houver).

═══════════════════════════
PARTE 1 — DETECÇÃO DE DUPLICATA
═══════════════════════════
Compare o NOVO_RELATO com os REPORTS_EXISTENTES pelo SIGNIFICADO, não pelas 
palavras. Dois relatos descritos de formas diferentes podem ser o mesmo problema.
- Se encontrar um report existente que trata do MESMO problema (alta 
  probabilidade), retorne "possivel_duplicata": true, com o id e o status do 
  report existente, para que o sistema pergunte ao curador se é o mesmo.
- Se não houver correspondência clara, "possivel_duplicata": false.
- Na dúvida entre ser o mesmo ou não, marque como possível duplicata (true) — 
  é melhor perguntar ao curador do que criar um duplicado silencioso. O curador 
  sempre confirma; você apenas sinaliza.

═══════════════════════════
PARTE 2 — CLASSIFICAÇÃO (suporte vs melhoria)
═══════════════════════════
Identifique qual funcionalidade da BASELINE o relato menciona e compare:
- SUPORTE: a funcionalidade existia na entrega (existia = sim) e parou de 
  funcionar ou funciona errado. É correção.
- MELHORIA: a funcionalidade não existia na entrega (existia = nao). É escopo novo.
- REQUER_ANALISE_HUMANA: use quando (a) a funcionalidade existia mas com qualidade 
  discutível e o pedido é aprimorá-la (zona cinza), (b) o relato toca em itens com 
  estados diferentes na baseline (ex: existia em um contexto e não em outro), ou 
  (c) você não encontra a funcionalidade na baseline com clareza. NUNCA seja 
  categórico na zona cinza — recue para análise humana e explique os dois lados.

Regras:
- Justifique SEMPRE ancorando na baseline: cite a funcionalidade e o que ela diz 
  (existia sim/não, em qual camada).
- Se não achar a funcionalidade na baseline, diga isso — não invente.
- A classificação do curador (no NOVO_RELATO) é a opinião dele; você classifica 
  de forma independente. Se divergir, tudo bem — o super admin decide depois.

═══════════════════════════
PARTE 3 — DIREÇÃO TÉCNICA (apenas para o super admin)
═══════════════════════════
Sugira onde e como resolver. Use a "camada" da baseline como pista:
- camada "dify" → ajuste de PROMPT no agente, OU migração para KB. Decida: se é 
  COMPORTAMENTO/instrução (como agir, o que não dizer, formato) → prompt. Se é 
  CONHECIMENTO/dado que muda (protocolos, faixas, listas, doses) → KB.
- camada "lovable" → ajuste de INTERFACE (frontend).
- camada "banco" → ajuste no banco de dados.

A direção técnica é SUGESTÃO para o super admin decidir, não certeza. Se houver 
risco ou dúvida, sinalize no campo "verificar_antes".

═══════════════════════════
FORMATO DE SAÍDA — responda APENAS com este JSON, sem texto antes ou depois:
═══════════════════════════
{
  "possivel_duplicata": true | false,
  "duplicata_de": { "id": "...", "status": "..." } | null,
  "funcionalidade": "nome da funcionalidade identificada",
  "classificacao": "suporte" | "melhoria" | "requer_analise_humana",
  "confianca": "alta" | "media" | "baixa",
  "justificativa": "explicação ancorada na baseline, em linguagem clara",
  "item_baseline": "a funcionalidade da baseline usada como referência",
  "direcao_tecnica": {
    "camada": "dify" | "lovable" | "banco" | "multiplas",
    "tipo_ajuste": "prompt" | "kb" | "interface" | "banco" | "misto",
    "sugestao": "o que fazer, concreto",
    "verificar_antes": "o que o super admin deve confirmar",
    "ideias_extras": "melhorias relacionadas que valem considerar (opcional)"
  }
}`;
const OPENAI_MODEL = "gpt-5.2";
const OPENAI_TIMEOUT_MS = 60000;
const CONFIDENCE_SCORE = { alta: 0.9, media: 0.6, baixa: 0.3 };
function asText(value) {
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}
/** Extrai o JSON mesmo se o modelo devolver texto ao redor. Lança se inválido. */
function parseClassifierJson(content) {
    const start = content.indexOf("{");
    const end = content.lastIndexOf("}");
    if (start === -1 || end <= start)
        throw new Error("Resposta da IA sem JSON.");
    const parsed = JSON.parse(content.slice(start, end + 1));
    const classificacao = asText(parsed.classificacao);
    const justificativa = asText(parsed.justificativa);
    if (!classificacao || !justificativa) {
        throw new Error("JSON da IA incompleto (classificação ou justificativa ausente).");
    }
    if (!["suporte", "melhoria", "requer_analise_humana"].includes(classificacao)) {
        throw new Error(`Classificação inesperada: ${classificacao}`);
    }
    return parsed;
}
/**
 * Roda a classificação e grava o resultado. Nunca lança: em qualquer falha
 * marca `ai_status = 'failed'` e devolve o payload de falha para o curador.
 */
export async function classifyCurationRequest(input) {
    const failed = {
        ai_status: "failed",
        classificacao: null,
        confianca: null,
        justificativa: null,
        possivel_duplicata: false,
        duplicata: null,
    };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    async function markFailed(reason) {
        try {
            await supabaseAdmin
                .from("curation_requests")
                .update({
                ai_status: "failed",
                ai_error: reason.slice(0, 500),
                ai_analyzed_at: new Date().toISOString(),
            })
                .eq("id", input.requestId);
        }
        catch (error) {
            console.error("[curadoria-ia] Falha ao marcar ai_status=failed", error);
        }
    }
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        await markFailed("OPENAI_API_KEY ausente no ambiente do servidor.");
        return failed;
    }
    try {
        // 1. Baseline (estática — vai logo após o prompt para aproveitar cache de prompt).
        const { data: baseline } = await supabaseAdmin
            .from("baseline_items")
            .select("area, funcionalidade, existia, camada, comportamento_tecnico, legivel")
            .eq("baseline_version", "1.0")
            .order("sort_order", { ascending: true });
        // 2. Reports existentes (para duplicata).
        const { data: existing } = await supabaseAdmin
            .from("curation_requests")
            .select("id, title, description, status, curator_classification")
            .neq("id", input.requestId)
            .order("created_at", { ascending: false })
            .limit(60);
        const existingCompact = (existing ?? []).map((r) => ({
            id: r.id,
            titulo: r.title,
            descricao: typeof r.description === "string" ? r.description.slice(0, 400) : "",
            status: r.status,
            classificacao_curador: r.curator_classification,
        }));
        // 3. Imagem anexada (URL assinada curta — a API de visão busca o arquivo).
        let imageUrl = null;
        if (input.imagePath) {
            const { data: signed } = await supabaseAdmin.storage
                .from("curation-attachments")
                .createSignedUrl(input.imagePath, 600);
            imageUrl = signed?.signedUrl ?? null;
        }
        const userContent = [
            {
                type: "text",
                text: [
                    `REPORTS_EXISTENTES:\n${JSON.stringify(existingCompact)}`,
                    `NOVO_RELATO:\n${JSON.stringify({
                        titulo: input.title,
                        descricao: input.description,
                        classificacao_do_curador: input.curatorClassification,
                        dimensao_do_curador: input.curatorDimension,
                        tem_imagem: !!imageUrl,
                    })}`,
                ].join("\n\n"),
            },
        ];
        if (imageUrl) {
            userContent.push({ type: "image_url", image_url: { url: imageUrl } });
        }
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);
        let response;
        try {
            response = await fetch("https://api.openai.com/v1/chat/completions", {
                method: "POST",
                signal: controller.signal,
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    model: OPENAI_MODEL,
                    reasoning_effort: "low",
                    response_format: { type: "json_object" },
                    messages: [
                        // Prefixo estável (prompt + baseline) => elegível a cache de prompt.
                        { role: "system", content: CURATION_CLASSIFIER_SYSTEM_PROMPT },
                        {
                            role: "system",
                            content: `BASELINE (v1.0):\n${JSON.stringify(baseline ?? [])}`,
                        },
                        { role: "user", content: userContent },
                    ],
                }),
            });
        }
        finally {
            clearTimeout(timer);
        }
        if (!response.ok) {
            const body = await response.text().catch(() => "");
            throw new Error(`OpenAI ${response.status}: ${body.slice(0, 300)}`);
        }
        const payload = (await response.json());
        const content = payload.choices?.[0]?.message?.content ?? "";
        const parsed = parseClassifierJson(content);
        const classificacao = asText(parsed.classificacao);
        const justificativa = asText(parsed.justificativa);
        const confianca = asText(parsed.confianca)?.toLowerCase() ?? null;
        // Duplicata só vale se o id realmente existir na lista enviada.
        const rawDupId = asText(parsed.duplicata_de?.id ?? null);
        const match = rawDupId ? existingCompact.find((r) => r.id === rawDupId) : undefined;
        const isDuplicate = parsed.possivel_duplicata === true && !!match;
        const duplicata = match
            ? { id: match.id, status: String(match.status ?? ""), title: match.titulo }
            : null;
        await supabaseAdmin
            .from("curation_requests")
            .update({
            ai_status: "done",
            ai_classification: classificacao,
            ai_confidence: confianca ? (CONFIDENCE_SCORE[confianca] ?? null) : null,
            ai_confidence_label: confianca,
            ai_justification: justificativa,
            ai_functionality: asText(parsed.funcionalidade),
            ai_baseline_item: asText(parsed.item_baseline),
            ai_technical_direction: parsed.direcao_tecnica
                ? JSON.stringify(parsed.direcao_tecnica)
                : null,
            ai_error: null,
            ai_analyzed_at: new Date().toISOString(),
        })
            .eq("id", input.requestId);
        return {
            ai_status: "done",
            classificacao,
            confianca,
            justificativa,
            possivel_duplicata: isDuplicate,
            duplicata: isDuplicate ? duplicata : null,
        };
    }
    catch (error) {
        const reason = error instanceof Error ? error.message : "Erro desconhecido na IA.";
        console.error("[curadoria-ia] Classificação falhou:", reason);
        await markFailed(reason);
        return failed;
    }
}
