/**
 * Leitura controlada, server-side, da conversa original que originou um report
 * de curadoria. Só é chamado por `curation-admin.functions.ts` DEPOIS de
 * confirmar que o chamador é super_admin sob RLS.
 *
 * Regras de segurança:
 * - A entrada é o id do report (nunca um chat_id arbitrário do cliente).
 * - Somente leitura: nenhuma escrita nas tabelas de chat.
 * - Cada visualização é auditada em `integration_logs`.
 */

export interface CurationConversationMessage {
  id: string;
  role: string;
  content: string;
  created_at: string | null;
  is_reported: boolean;
}

export interface CurationConversationResult {
  source: "patient" | "general";
  chat_id: string;
  chat_title: string | null;
  agent_type: string | null;
  selected_task: string | null;
  patient: { id: string; name: string; gender: string | null; birth_date: string | null } | null;
  messages: CurationConversationMessage[];
  reported_message_id: string | null;
}

export async function loadCurationConversation(
  requestId: string,
  adminUserId: string,
): Promise<CurationConversationResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // 1. O report dita quais dados podem ser lidos.
  const { data: report, error: reportError } = await supabaseAdmin
    .from("curation_requests" as never)
    .select("id, chat_id, message_id, patient_id, created_by")
    .eq("id", requestId)
    .maybeSingle();

  if (reportError) throw new Response(reportError.message, { status: 500 });
  if (!report) throw new Response("Solicitação não encontrada.", { status: 404 });

  const row = report as unknown as {
    id: string;
    chat_id: string | null;
    message_id: string | null;
    patient_id: string | null;
    created_by: string;
  };

  if (!row.chat_id) {
    throw new Response("Esta solicitação não tem conversa associada.", { status: 400 });
  }

  let result: CurationConversationResult | null = null;

  // 2a. Conversa com paciente.
  const { data: patientChat } = await supabaseAdmin
    .from("patient_chats")
    .select("id, title, agent_type, selected_task, patient_id")
    .eq("id", row.chat_id)
    .maybeSingle();

  if (patientChat) {
    const { data: messages, error: messagesError } = await supabaseAdmin
      .from("chat_messages")
      .select("id, role, content, created_at")
      .eq("chat_id", patientChat.id)
      .order("created_at", { ascending: true })
      .limit(400);
    if (messagesError) throw new Response(messagesError.message, { status: 500 });

    let patient: CurationConversationResult["patient"] = null;
    if (patientChat.patient_id) {
      const { data: p } = await supabaseAdmin
        .from("patients")
        .select("id, name, gender, birth_date")
        .eq("id", patientChat.patient_id)
        .maybeSingle();
      if (p) {
        patient = {
          id: p.id,
          name: p.name,
          gender: (p.gender as string | null) ?? null,
          birth_date: p.birth_date ?? null,
        };
      }
    }

    result = {
      source: "patient",
      chat_id: patientChat.id,
      chat_title: patientChat.title ?? null,
      agent_type: patientChat.agent_type ?? null,
      selected_task: patientChat.selected_task ?? null,
      patient,
      messages: (messages ?? []).map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content ?? "",
        created_at: m.created_at ?? null,
        is_reported: !!row.message_id && m.id === row.message_id,
      })),
      reported_message_id: row.message_id,
    };
  } else {
    // 2b. Conversa geral (sem paciente).
    const { data: generalChat } = await supabaseAdmin
      .from("general_chats")
      .select("id, title, agent_type, profile")
      .eq("id", row.chat_id)
      .maybeSingle();

    if (!generalChat) {
      throw new Response("Conversa original não encontrada.", { status: 404 });
    }

    const { data: messages, error: messagesError } = await supabaseAdmin
      .from("general_chat_messages")
      .select("id, role, content, created_at")
      .eq("chat_id", generalChat.id)
      .order("created_at", { ascending: true })
      .limit(400);
    if (messagesError) throw new Response(messagesError.message, { status: 500 });

    result = {
      source: "general",
      chat_id: generalChat.id,
      chat_title: generalChat.title ?? null,
      agent_type: generalChat.agent_type ?? null,
      selected_task: generalChat.profile ?? null,
      patient: null,
      messages: (messages ?? []).map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content ?? "",
        created_at: m.created_at ?? null,
        is_reported: !!row.message_id && m.id === row.message_id,
      })),
      reported_message_id: row.message_id,
    };
  }

  // 3. Auditoria da visualização (nunca bloqueia a leitura).
  try {
    await supabaseAdmin.from("integration_logs").insert({
      source: "curadoria",
      event: "admin_view_conversation",
      status: "success",
      message: `Super admin visualizou a conversa original do report ${row.id}`,
      payload: {
        admin_id: adminUserId,
        curation_request_id: row.id,
        chat_id: row.chat_id,
        message_id: row.message_id,
        curator_id: row.created_by,
        source: result.source,
        messages_count: result.messages.length,
      },
    });
  } catch (logError) {
    console.error("[curadoria] Falha ao registrar auditoria de visualização", logError);
  }

  return result;
}
