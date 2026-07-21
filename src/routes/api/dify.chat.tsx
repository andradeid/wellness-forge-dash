import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { disabledRealtimeOptions } from "@/integrations/supabase/disabled-realtime";
import {
  getDifyAgentConfig,
  invalidateDifyConfigCache,
} from "@/lib/dify-config.server";

// ============================================================
// Rate limiting (server-side, funciona com múltiplas réplicas)
// - 1 stream simultâneo por usuário (PK em active_streams)
// - N envios/minuto por usuário (contagem em rate_limit_hits)
// Estado no Postgres → consistente entre todas as réplicas.
// ============================================================
const MAX_STREAMS_PER_MINUTE = 10;

async function adminClient() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}



async function acquireStreamSlot(userId: string, agentType: string): Promise<
  { ok: true } | { ok: false; reason: "concurrent" | "rate"; retryAfter: number | null }
> {
  try {
    const admin = await adminClient();
    const { data, error } = await admin.rpc("try_acquire_stream_slot" as any, {

      p_user_id: userId,
      p_agent_type: agentType,
      p_max_per_minute: MAX_STREAMS_PER_MINUTE,
    });
    if (error) {
      // Falha na infra de rate limit não deve bloquear o usuário — log e libera.
      console.error("[rate-limit] acquire failed, allowing:", error);
      return { ok: true };
    }
    const d = data as any;
    if (d?.ok === true) return { ok: true };
    return {
      ok: false,
      reason: d?.reason === "rate" ? "rate" : "concurrent",
      retryAfter: typeof d?.retry_after_s === "number" ? d.retry_after_s : null,
    };
  } catch (e) {
    console.error("[rate-limit] acquire threw, allowing:", e);
    return { ok: true };
  }
}

async function releaseStreamSlot(userId: string) {
  try {
    const admin = await adminClient();
    await admin.rpc("release_stream_slot" as any, { p_user_id: userId });

  } catch (e) {
    // Slot órfão será limpo por cleanup >10min. Não é fatal.
    console.warn("[rate-limit] release failed:", e);
  }
}

/**
 * Envolve um stream do upstream (SSE do Dify) para chamar release() ao final,
 * seja sucesso, erro, desconexão do cliente ou timeout de segurança.
 */
function wrapStreamWithRelease(
  upstreamBody: ReadableStream<Uint8Array>,
  onDone: () => void,
  maxDurationMs = 360000,
): ReadableStream<Uint8Array> {
  let released = false;
  let safetyTimer: ReturnType<typeof setTimeout> | null = null;
  const release = () => {
    if (released) return;
    released = true;
    if (safetyTimer) {
      clearTimeout(safetyTimer);
      safetyTimer = null;
    }
    try {
      onDone();
    } catch (e) {
      console.warn("[rate-limit] onDone threw:", e);
    }
  };
  // Rede/proxy pode segurar a conexão sem entregar `done` nem `cancel`.
  // Garantimos liberação após maxDurationMs mesmo se nada acontecer.
  safetyTimer = setTimeout(() => {
    console.warn("[rate-limit] safety release timer fired");
    release();
  }, maxDurationMs);

  // Scanner leve para detectar o evento lógico final do Dify (`message_end`)
  // e liberar o slot imediatamente, sem esperar o TCP/proxy fechar.
  const decoder = new TextDecoder("utf-8", { fatal: false });
  let sniffBuf = "";
  const FINAL_EVENTS = /"event"\s*:\s*"(message_end|error|tts_message_end|workflow_finished)"/;
  const scanForFinal = (chunk: Uint8Array) => {
    if (released) return;
    sniffBuf += decoder.decode(chunk, { stream: true });
    if (FINAL_EVENTS.test(sniffBuf)) {
      release();
      sniffBuf = "";
      return;
    }
    // Evita crescimento ilimitado do buffer: mantém apenas a cauda.
    if (sniffBuf.length > 8192) sniffBuf = sniffBuf.slice(-2048);
  };

  const reader = upstreamBody.getReader();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          release();
          return;
        }
        scanForFinal(value);
        controller.enqueue(value);
      } catch (e) {
        controller.error(e);
        release();
      }
    },
    cancel() {
      // Cliente desconectou (fechou aba, cancelou fetch).
      reader.cancel().catch(() => {});
      release();
    },
  });
}


async function authUser(request: Request): Promise<{ userId: string; token: string } | null> {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const token = auth.slice(7);
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false }, realtime: disabledRealtimeOptions },
  );
  const { data, error } = await supabase.auth.getClaims(token);
  if (error || !data?.claims?.sub) return null;
  return { userId: data.claims.sub, token };
}

function resolveAgentType(body: any): string {
  const explicit = typeof body?.agent_type === "string" ? body.agent_type.trim() : "";
  if (explicit) return explicit;
  if (Array.isArray(body?.files) && body.files.length > 0) return "exam";
  const metaTask = typeof body?.meta?.task_type === "string" ? body.meta.task_type.trim() : "";
  if (metaTask) return metaTask;
  return "exam";
}

export const Route = createFileRoute("/api/dify/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await authUser(request);
        if (!auth) return new Response("Unauthorized", { status: 401 });
        const { userId, token } = auth;

        const body = await request.json();
        const agentType = resolveAgentType(body);

        // ============================================================
        // Rate limit: acquire ANTES de gastar recurso com Dify config
        // ou fetch upstream. Bloqueio server-side → aba nova não contorna.
        // ============================================================
        const slot = await acquireStreamSlot(userId, agentType);
        if (!slot.ok) {
          const isConcurrent = slot.reason === "concurrent";
          const message = isConcurrent
            ? "Aguarde a análise atual terminar antes de enviar outra."
            : "Muitos envios em pouco tempo. Aguarde alguns segundos e tente novamente.";
          const headers: Record<string, string> = { "Content-Type": "application/json" };
          if (slot.retryAfter && slot.retryAfter > 0) {
            headers["Retry-After"] = String(slot.retryAfter);
          }
          return new Response(
            JSON.stringify({ error: message, reason: slot.reason }),
            { status: 429, headers },
          );
        }

        // A partir daqui, TODA saída precisa liberar o slot.
        // Helper que envolve returns de erro.
        const releaseAnd = <T,>(v: T): T => {
          releaseStreamSlot(userId).catch(() => {});
          return v;
        };

        let baseUrl: string;
        let apiKey: string;
        try {
          ({ baseUrl, apiKey } = await getDifyAgentConfig(agentType, token));
        } catch (e: unknown) {
          const message = e instanceof Error ? e.message : String(e);
          const status = message.includes("não encontrado") || message.includes("desativado") ? 404 : 500;
          return releaseAnd(new Response(JSON.stringify({ error: message }), {
            status,
            headers: { "Content-Type": "application/json" }
          }));
        }

        const { query, conversation_id, inputs, files, meta } = body ?? {};

        const sanitize = (s: unknown) =>
          String(s ?? "").replace(/[\r\n\t]+/g, " ").trim();

        const sanitizeQuery = (text: string) =>
          text
            .replace(/[\u0000-\u001F\u007F]/g, ' ')
            .trim();

        const nutriName = sanitize(meta?.nutritionist_name);
        const patientName = sanitize(meta?.patient_name);
        const safeQuery = sanitizeQuery(query || "");

        const patientIdSafe = sanitize(meta?.patient_id) || "no-patient";
        const composedUser = `${userId}:${patientIdSafe}:${agentType}`;
        const displayUser = composedUser.length > 64 ? composedUser.slice(-64) : composedUser;

        const selectedTask = sanitize(body?.selected_task || meta?.selected_task);

        const mergedInputs = {
          nutritionist_name: nutriName || "",
          nutritionist_email: sanitize(meta?.nutritionist_email) || "",
          nutritionist_crn: sanitize(meta?.nutritionist_crn) || "",
          nutritionist_pronoun: sanitize(meta?.nutritionist_pronoun) || "",
          clinic_name: sanitize(meta?.clinic_name) || "",
          clinic_phone: sanitize(meta?.clinic_phone) || "",
          clinic_logo_url: sanitize(meta?.clinic_logo_url) || "",
          patient_name: patientName || "",
          patient_id: sanitize(meta?.patient_id) || "",
          patient_sex: sanitize(meta?.patient_sex) || "",
          patient_age: sanitize(meta?.patient_age) || "",
          patient_profile: sanitize(meta?.patient_profile) || "",
          gestante_tipo: sanitize(meta?.gestante_tipo) || "",
          gestante_periodo: sanitize(meta?.gestante_periodo) || "",
          fase_ciclo: sanitize(meta?.fase_ciclo) || "",
          ...(selectedTask ? { selected_task: selectedTask } : {}),
          ...(inputs ?? {}),
        };

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 360000);

        const sendToDify = () =>
          fetch(`${baseUrl}/chat-messages`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            signal: controller.signal,
            body: JSON.stringify({
              query: safeQuery,
              inputs: mergedInputs,
              response_mode: "streaming",
              user: displayUser,
              files: files ?? [],
              ...(conversation_id ? { conversation_id } : {}),
            }),
          });

        let upstream;
        try {
          upstream = await sendToDify();
        } catch (e: any) {
          clearTimeout(timeout);
          console.error('[PROXY FETCH ERROR]', e);
          return releaseAnd(new Response(JSON.stringify({ error: e.message || "Timeout or connection error" }), {
            status: 504,
            headers: { "Content-Type": "application/json" }
          }));
        }
        clearTimeout(timeout);

        if (!upstream.ok) {
          const text = await upstream.text().catch(() => "");

          console.error('[DIFY ERROR]', {
            status: upstream.status,
            agent: agentType,
            body: text
          });

          if (
            (upstream.status === 403 || upstream.status === 401) &&
            /workspace.*archived|status is archived|invalid/i.test(text)
          ) {
            invalidateDifyConfigCache();
            try {
              ({ baseUrl, apiKey } = await getDifyAgentConfig(agentType, token, true));
            } catch (e: unknown) {
              const message = e instanceof Error ? e.message : String(e);
              return releaseAnd(new Response(message, { status: 500 }));
            }

            const retryController = new AbortController();
            const retryTimeout = setTimeout(() => retryController.abort(), 360000);

            try {
              upstream = await fetch(`${baseUrl}/chat-messages`, {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${apiKey}`,
                  "Content-Type": "application/json",
                },
                signal: retryController.signal,
                body: JSON.stringify({
                  query: safeQuery,
                  inputs: mergedInputs,
                  response_mode: "streaming",
                  user: displayUser,
                  files: files ?? [],
                  ...(conversation_id ? { conversation_id } : {}),
                }),
              });
            } catch (retryErr: any) {
              clearTimeout(retryTimeout);
              return releaseAnd(new Response(retryErr.message || "Retry timeout", { status: 504 }));
            }
            clearTimeout(retryTimeout);

            if (upstream.ok && upstream.body) {
              // Sucesso no retry: envolve stream com release.
              const wrapped = wrapStreamWithRelease(upstream.body, () => {
                releaseStreamSlot(userId).catch(() => {});
              });
              return new Response(wrapped, {
                status: 200,
                headers: {
                  "Content-Type": "text/event-stream; charset=utf-8",
                  "Cache-Control": "no-cache, no-transform",
                  Connection: "keep-alive",
                },
              });
            }
            const retryText = await upstream.text().catch(() => "");
            return releaseAnd(new Response(
              retryText ||
                "Workspace do Dify arquivado. Atualize a API Key da conta ativa em Integrações & APIs.",
              { status: upstream.status },
            ));
          }

          return releaseAnd(new Response(
            JSON.stringify({
              error: text,
              status: upstream.status,
              agent: agentType
            }),
            {
              status: upstream.status,
              headers: { "Content-Type": "application/json" }
            }
          ));
        }

        if (!upstream.ok || !upstream.body) {
          const text = await upstream.text().catch(() => "");
          return releaseAnd(new Response(text || "Dify error", { status: upstream.status }));
        }

        // Sucesso: envolve o stream pra liberar o slot no fim ou no cancel.
        const wrapped = wrapStreamWithRelease(upstream.body, () => {
          releaseStreamSlot(userId).catch(() => {});
        });

        return new Response(wrapped, {
          status: 200,
          headers: {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
          },
        });
      },
    },
  },
});
