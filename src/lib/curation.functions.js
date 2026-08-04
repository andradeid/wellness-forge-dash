import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
const CLASSIFICATIONS = ["suporte", "melhoria"];
const DIMENSIONS = ["comportamento", "tabela_dado", "formatacao", "clinico", "outro"];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function optionalUuid(value) {
    return typeof value === "string" && UUID_RE.test(value) ? value : null;
}
export const createCurationRequest = createServerFn({ method: "POST" })
    .middleware([requireSupabaseAuth])
    .inputValidator((data) => {
    const title = String(data?.title ?? "").trim();
    const description = String(data?.description ?? "").trim();
    if (title.length < 3)
        throw new Response("O título precisa ter ao menos 3 caracteres.", { status: 400 });
    if (title.length > 200)
        throw new Response("Título muito longo.", { status: 400 });
    if (description.length < 10)
        throw new Response("A descrição precisa ter ao menos 10 caracteres.", { status: 400 });
    if (description.length > 8000)
        throw new Response("Descrição muito longa.", { status: 400 });
    if (!CLASSIFICATIONS.includes(data?.curatorClassification))
        throw new Response("Classificação inválida.", { status: 400 });
    if (!DIMENSIONS.includes(data?.curatorDimension))
        throw new Response("Dimensão inválida.", { status: 400 });
    const imagePath = typeof data?.imagePath === "string" && /^[\w./-]{1,200}$/.test(data.imagePath)
        ? data.imagePath
        : null;
    return {
        title,
        description,
        curatorClassification: data.curatorClassification,
        curatorDimension: data.curatorDimension,
        imagePath,
        chatId: optionalUuid(data?.chatId),
        messageId: optionalUuid(data?.messageId),
        patientId: optionalUuid(data?.patientId),
        agentKey: typeof data?.agentKey === "string" && data.agentKey.length <= 120 ? data.agentKey : null,
    };
})
    .handler(async ({ context, data }) => {
    // 1. Grava o report primeiro — nada depois disso pode perdê-lo.
    const { data: inserted, error } = await context.supabase
        .from("curation_requests")
        .insert({
        created_by: context.userId,
        title: data.title,
        description: data.description,
        curator_classification: data.curatorClassification,
        curator_dimension: data.curatorDimension,
        status: "registrado",
        image_url: data.imagePath,
        ...(data.chatId ? { chat_id: data.chatId } : {}),
        ...(data.messageId ? { message_id: data.messageId } : {}),
        ...(data.patientId ? { patient_id: data.patientId } : {}),
        ...(data.agentKey ? { agent_key: data.agentKey } : {}),
    })
        .select("id, numero_sequencial")
        .single();
    if (error || !inserted?.id) {
        throw new Response(error?.message ?? "Não foi possível registrar a solicitação.", {
            status: 400,
        });
    }
    const requestId = inserted.id;
    // 2. Classificação é complemento: nunca derruba a criação.
    const { classifyCurationRequest } = await import("./curation-ai.server");
    const analysis = await classifyCurationRequest({
        requestId,
        title: data.title,
        description: data.description,
        curatorClassification: data.curatorClassification,
        curatorDimension: data.curatorDimension,
        imagePath: data.imagePath,
    });
    // 3. Resposta ao curador — sem direção técnica.
    return { requestId, analysis };
});
/** Curador confirma (ou não) que o report é duplicata de um existente. */
export const resolveCurationDuplicate = createServerFn({ method: "POST" })
    .middleware([requireSupabaseAuth])
    .inputValidator((data) => {
    if (!UUID_RE.test(String(data?.requestId ?? "")))
        throw new Response("Identificador inválido.", { status: 400 });
    if (!UUID_RE.test(String(data?.duplicateOf ?? "")))
        throw new Response("Identificador inválido.", { status: 400 });
    return {
        requestId: data.requestId,
        duplicateOf: data.duplicateOf,
        isSame: data.isSame === true,
    };
})
    .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: own } = await supabaseAdmin
        .from("curation_requests")
        .select("id, created_by")
        .eq("id", data.requestId)
        .maybeSingle();
    if (!own || own.created_by !== context.userId) {
        throw new Response("Forbidden", { status: 403 });
    }
    if (!data.isSame)
        return { linked: false, original: null };
    const { data: original } = await supabaseAdmin
        .from("curation_requests")
        .select("id, title, status")
        .eq("id", data.duplicateOf)
        .maybeSingle();
    if (!original)
        throw new Response("Solicitação original não encontrada.", { status: 404 });
    await supabaseAdmin
        .from("curation_requests")
        .update({ duplicate_of: data.duplicateOf, status: "duplicada" })
        .eq("id", data.requestId);
    return {
        linked: true,
        original: {
            id: original.id,
            title: original.title,
            status: original.status,
        },
    };
});
/** Curador registra concordância ou divergência com a classificação da IA. */
export const setCuratorAgreement = createServerFn({ method: "POST" })
    .middleware([requireSupabaseAuth])
    .inputValidator((data) => {
    if (!UUID_RE.test(String(data?.requestId ?? "")))
        throw new Response("Identificador inválido.", { status: 400 });
    return { requestId: data.requestId, agrees: data.agrees === true };
})
    .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: own } = await supabaseAdmin
        .from("curation_requests")
        .select("id, created_by")
        .eq("id", data.requestId)
        .maybeSingle();
    if (!own || own.created_by !== context.userId) {
        throw new Response("Forbidden", { status: 403 });
    }
    await supabaseAdmin
        .from("curation_requests")
        .update({ curator_agreement: data.agrees ? "concorda" : "discorda" })
        .eq("id", data.requestId);
    return { ok: true };
});
