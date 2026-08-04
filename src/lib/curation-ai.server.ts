/**
 * Classificador de curadoria (OpenAI) — SOMENTE servidor.
 *
 * Regras de segurança/robustez:
 * - A chave vive apenas em `process.env.OPENAI_API_KEY`; nenhuma chamada parte do navegador.
 * - Este módulo NUNCA lança para o fluxo de criação: qualquer falha vira `ai_status = 'failed'`.
 * - A direção técnica gravada aqui é exclusiva do painel super admin.
 */

export const CURATION_CLASSIFIER_SYSTEM_PROMPT = `Você é o Classificador de Curadoria da Lumma, um sistema de nutrição clínica. 
Sua função tem TRÊS partes, nesta ordem: 
(1) detectar se o relato já foi reportado antes (DUPLICATA);
(2) interpretar o ANEXO (imagem ou documento) fornecendo uma análise clínica/técnica;
(3) classificar o relato como suporte ou melhoria, comparando com a BASELINE.

Você receberá:
- BASELINE: lista de funcionalidades do sistema na entrega.
- REPORTS_EXISTENTES: solicitações já registradas.
- NOVO_RELATO: o relato do curador, incluindo metadados sobre o anexo.
- ANEXO: imagem (via visão) ou texto extraído de documento.

═══════════════════════════
PARTE 1 — DETECÇÃO DE DUPLICATA
═══════════════════════════
Compare o NOVO_RELATO com os REPORTS_EXISTENTES pelo SIGNIFICADO.
- "possivel_duplicata": true se houver correspondência clara.

═══════════════════════════
PARTE 2 — ANÁLISE DO ANEXO
═══════════════════════════
Se houver anexo (imagem ou texto de documento):
- Descreva o que o anexo mostra em relação ao relato.
- Se for um exame, identifique marcadores ou padrões mencionados.
- Esta análise irá para o campo "analise_anexo" e ajuda o super admin a entender o contexto sem abrir o arquivo.

═══════════════════════════
PARTE 3 — CLASSIFICAÇÃO (suporte vs melhoria)
═══════════════════════════
Identifique a funcionalidade da BASELINE e compare:
- SUPORTE: existia na entrega e parou de funcionar ou funciona errado.
- MELHORIA: não existia na entrega (escopo novo).
- REQUER_ANALISE_HUMANA: zona cinza ou não encontrado na baseline.

═══════════════════════════
PARTE 4 — DIREÇÃO TÉCNICA (apenas para o super admin)
═══════════════════════════
Sugira onde resolver: camada (dify, lovable, banco) e tipo de ajuste.

═══════════════════════════
FORMATO DE SAÍDA — responda APENAS com este JSON:
═══════════════════════════
{
  "possivel_duplicata": true | false,
  "duplicata_de": { "id": "...", "status": "..." } | null,
  "analise_anexo": "descrição técnica do que foi identificado no anexo (máx 1000 caracteres)",
  "funcionalidade": "nome da funcionalidade identificada",
  "classificacao": "suporte" | "melhoria" | "requer_analise_humana",
  "confianca": "alta" | "media" | "baixa",
  "justificativa": "explicação ancorada na baseline",
  "item_baseline": "referência da baseline",
  "direcao_tecnica": {
    "camada": "dify" | "lovable" | "banco" | "multiplas",
    "tipo_ajuste": "prompt" | "kb" | "interface" | "banco" | "misto",
    "sugestao": "o que fazer",
    "verificar_antes": "confirmações necessárias"
  }
}`;

const OPENAI_MODEL = "gpt-5.2";
const OPENAI_TIMEOUT_MS = 60_000;
const CONFIDENCE_SCORE: Record<string, number> = { alta: 0.9, media: 0.6, baixa: 0.3 };

export interface ClassifierDuplicate {
  id: string;
  status: string;
  title?: string;
}

/** Payload devolvido ao CURADOR — nunca inclui a direção técnica. */
export interface CuratorVisibleAnalysis {
  ai_status: "done" | "failed";
  classificacao: string | null;
  confianca: string | null;
  justificativa: string | null;
  possivel_duplicata: boolean;
  duplicata: ClassifierDuplicate | null;
}

interface ClassifierRawResult {
  possivel_duplicata?: unknown;
  duplicata_de?: { id?: unknown; status?: unknown } | null;
  analise_anexo?: unknown;
  funcionalidade?: unknown;
  classificacao?: unknown;
  confianca?: unknown;
  justificativa?: unknown;
  item_baseline?: unknown;
  direcao_tecnica?: unknown;
}

function asText(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

/** Extrai o JSON mesmo se o modelo devolver texto ao redor. Lança se inválido. */
function parseClassifierJson(content: string): ClassifierRawResult {
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("Resposta da IA sem JSON.");
  const parsed = JSON.parse(content.slice(start, end + 1)) as ClassifierRawResult;

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

interface ClassifyInput {
  requestId: string;
  title: string;
  description: string;
  curatorClassification: string | null;
  curatorDimension: string | null;
  imagePath: string | null;
  attachmentBuffer?: Buffer | null;
  attachmentMimeType?: string | null;
}

/**
 * Roda a classificação e grava o resultado. Nunca lança: em qualquer falha
 * marca `ai_status = 'failed'` e devolve o payload de falha para o curador.
 */
export async function classifyCurationRequest(
  input: ClassifyInput,
): Promise<CuratorVisibleAnalysis> {
  const failed: CuratorVisibleAnalysis = {
    ai_status: "failed",
    classificacao: null,
    confianca: null,
    justificativa: null,
    possivel_duplicata: false,
    duplicata: null,
  };

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  async function markFailed(reason: string) {
    try {
      await supabaseAdmin
        .from("curation_requests" as never)
        .update({
          ai_status: "failed",
          ai_error: reason.slice(0, 500),
          ai_analyzed_at: new Date().toISOString(),
        } as never)
        .eq("id", input.requestId);
    } catch (error) {
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
      .from("baseline_items" as never)
      .select("area, funcionalidade, existia, camada, comportamento_tecnico, legivel")
      .eq("baseline_version", "1.0")
      .order("sort_order", { ascending: true });

    // 2. Reports existentes (para duplicata).
    const { data: existing } = await supabaseAdmin
      .from("curation_requests" as never)
      .select("id, title, description, status, curator_classification")
      .neq("id", input.requestId)
      .order("created_at", { ascending: false })
      .limit(60);

    const existingCompact = ((existing ?? []) as any[]).map((r) => ({
      id: r.id,
      titulo: r.title,
      descricao: typeof r.description === "string" ? r.description.slice(0, 400) : "",
      status: r.status,
      classificacao_curador: r.curator_classification,
    }));

    // 3. Tratamento de Anexo (Imagem ou Documento)
    let imageUrl: string | null = null;
    let extractedText: string | null = null;

    if (input.attachmentBuffer && input.attachmentMimeType) {
      const isDocument = ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"].includes(input.attachmentMimeType);
      
      if (isDocument) {
        try {
          // @ts-ignore - markitdown pode não ter tipos disponíveis
          const { MarkItDown } = await import("markitdown");
          const md = new MarkItDown();
          const result = await md.convert(input.attachmentBuffer);
          extractedText = result.text_content?.trim() || "";
          
          // Fallback: se PDF vier vazio (escaneado), tratamos como imagem se for PDF
          if (!extractedText && input.attachmentMimeType === "application/pdf") {
            // No sandbox, enviamos o buffer como base64 para o modelo com visão
            imageUrl = `data:application/pdf;base64,${input.attachmentBuffer.toString("base64")}`;
          }
        } catch (err) {
          console.error("[curadoria-ia] Falha na extração de texto:", err);
          // Falha na extração não derruba o fluxo, apenas segue sem o texto
        }
      } else if (input.attachmentMimeType.startsWith("image/")) {
        imageUrl = `data:${input.attachmentMimeType};base64,${input.attachmentBuffer.toString("base64")}`;
      }
    } else if (input.imagePath) {
      // Legado / Fallback via Storage
      const { data: signed } = await supabaseAdmin.storage
        .from("curation-attachments")
        .createSignedUrl(input.imagePath, 600);
      imageUrl = signed?.signedUrl ?? null;
    }

    const userContent: Array<Record<string, unknown>> = [
      {
        type: "text",
        text: [
          `REPORTS_EXISTENTES:\n${JSON.stringify(existingCompact)}`,
          `NOVO_RELATO:\n${JSON.stringify({
            titulo: input.title,
            descricao: input.description,
            classificacao_do_curador: input.curatorClassification,
            dimensao_do_curador: input.curatorDimension,
            tem_anexo: !!(imageUrl || extractedText),
            tipo_anexo: input.attachmentMimeType || "desconhecido",
            texto_extraido: extractedText || null,
          })}`,
        ].join("\n\n"),
      },
    ];
    
    // OpenAI aceita PDFs em modo visão se o modelo suportar (gpt-4o-2024-08-06+ ou gpt-4-turbo)
    // No gpt-5.2 (placeholder para o modelo de ponta aqui), mandamos via image_url
    if (imageUrl) {
      userContent.push({ type: "image_url", image_url: { url: imageUrl } });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);

    let response: Response;
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
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`OpenAI ${response.status}: ${body.slice(0, 300)}`);
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content ?? "";
    const parsed = parseClassifierJson(content);

    const classificacao = asText(parsed.classificacao)!;
    const justificativa = asText(parsed.justificativa)!;
    const confianca = asText(parsed.confianca)?.toLowerCase() ?? null;

    // Duplicata só vale se o id realmente existir na lista enviada.
    const rawDupId = asText(parsed.duplicata_de?.id ?? null);
    const match = rawDupId ? existingCompact.find((r) => r.id === rawDupId) : undefined;
    const isDuplicate = parsed.possivel_duplicata === true && !!match;
    const duplicata: ClassifierDuplicate | null = match
      ? { id: match.id, status: String(match.status ?? ""), title: match.titulo }
      : null;

    await supabaseAdmin
      .from("curation_requests" as never)
      .update({
        ai_status: "done",
        ai_classification: classificacao,
        ai_confidence: confianca ? (CONFIDENCE_SCORE[confianca] ?? null) : null,
        ai_confidence_label: confianca,
        ai_justification: justificativa,
        ai_functionality: asText(parsed.funcionalidade),
        ai_baseline_item: asText(parsed.item_baseline),
        ai_content_analysis: asText(parsed.analise_anexo),
        ai_technical_direction: parsed.direcao_tecnica
          ? JSON.stringify(parsed.direcao_tecnica)
          : null,
        ai_error: null,
        ai_analyzed_at: new Date().toISOString(),
      } as never)
      .eq("id", input.requestId);

    return {
      ai_status: "done",
      classificacao,
      confianca,
      justificativa,
      possivel_duplicata: isDuplicate,
      duplicata: isDuplicate ? duplicata : null,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Erro desconhecido na IA.";
    console.error("[curadoria-ia] Classificação falhou:", reason);
    await markFailed(reason);
    return failed;
  }
}
