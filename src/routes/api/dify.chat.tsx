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
export interface StreamOutcome {
  /** Trecho bruto do evento SSE `error` emitido pelo Dify, se houver. */
  streamError: string | null;
  /** Bytes entregues ao cliente — resposta muito curta indica falha silenciosa. */
  bytes: number;
  /** message_id devolvido pelo Dify (para cruzar com a análise). */
  messageId: string | null;
  /** conversation_id devolvido pelo Dify. */
  conversationId: string | null;
  /** Latência real da execução informada pelo Dify (ms), quando disponível. */
  providerLatencyMs: number | null;
  /** A resposta trouxe o array `markers` com ao menos um objeto. */
  sawMarkers: boolean;
}

function wrapStreamWithRelease(
  upstreamBody: ReadableStream<Uint8Array>,
  onDone: (outcome: StreamOutcome) => void,
  maxDurationMs = 360000,
): ReadableStream<Uint8Array> {
  let released = false;
  let streamError: string | null = null;
  let bytes = 0;
  let messageId: string | null = null;
  let conversationId: string | null = null;
  let providerLatencyMs: number | null = null;
  let sawMarkers = false;
  let safetyTimer: ReturnType<typeof setTimeout> | null = null;
  const release = () => {
    if (released) return;
    released = true;
    if (safetyTimer) {
      clearTimeout(safetyTimer);
      safetyTimer = null;
    }
    try {
      onDone({ streamError, bytes, messageId, conversationId, providerLatencyMs, sawMarkers });
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
    bytes += chunk.byteLength;
    sniffBuf += decoder.decode(chunk, { stream: true });
    // Log observabilidade: sinaliza quando o Dify emite `error` no meio do stream.
    if (!streamError && /"event"\s*:\s*"error"/.test(sniffBuf)) {
      console.warn("[dify-proxy] upstream event:error detected in stream");
      // Guarda o trecho bruto do evento para o registro de erros da IA.
      const idx = sniffBuf.search(/\{[^{}]*"event"\s*:\s*"error"/);
      streamError = (idx >= 0 ? sniffBuf.slice(idx) : sniffBuf).slice(0, 4000);
    }
    // Identificadores e latência real da execução (message_end).
    if (!messageId) {
      const m = sniffBuf.match(/"message_id"\s*:\s*"([^"]+)"/);
      if (m?.[1]) messageId = m[1];
    }
    if (!conversationId) {
      const c = sniffBuf.match(/"conversation_id"\s*:\s*"([^"]+)"/);
      if (c?.[1]) conversationId = c[1];
    }
    if (providerLatencyMs == null) {
      const l = sniffBuf.match(/"provider_response_latency"\s*:\s*([0-9.]+)/);
      if (l?.[1]) {
        const secs = Number(l[1]);
        // Dify devolve em segundos (float); valores grandes já vêm em ms.
        if (Number.isFinite(secs)) providerLatencyMs = Math.round(secs > 1000 ? secs : secs * 1000);
      }
    }
    // Detector estrutural: resposta trouxe o array de marcadores preenchido.
    if (!sawMarkers && /markers\\?"\s*:\s*\\?\[\s*\\?\{/.test(sniffBuf)) sawMarkers = true;
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

        // ------------------------------------------------------------
        // Contexto do registro de falhas da IA (tabela dify_error_logs).
        // Gravar nunca pode interromper o fluxo — helpers engolem erro.
        // ------------------------------------------------------------
        const startedAt = Date.now();
        const attachmentsMeta: Array<{ name?: string; type?: string }> = Array.isArray(body?.file_meta)
          ? body.file_meta
          : [];
        const logCtx = {
          userId,
          chatId: typeof body?.meta?.chat_id === "string" ? body.meta.chat_id : null,
          conversationId: typeof body?.conversation_id === "string" ? body.conversation_id : null,
          patientId: typeof body?.meta?.patient_id === "string" ? body.meta.patient_id : null,
          patientProfile:
            (typeof body?.meta?.patient_profile === "string" && body.meta.patient_profile) ||
            (typeof body?.meta?.patient_sex === "string" ? body.meta.patient_sex : null),
          selectedTask:
            (typeof body?.selected_task === "string" && body.selected_task) ||
            (typeof body?.meta?.selected_task === "string" ? body.meta.selected_task : null),
          agentType,
          attachmentCount: Array.isArray(body?.files) ? body.files.length : 0,
          attachmentName: attachmentsMeta[0]?.name ?? null,
          attachmentMime: attachmentsMeta[0]?.type ?? null,
        };

        const logDify = async (extra: {
          errorKind?: any;
          httpStatus?: number | null;
          rawError?: string | null;
          durationMs?: number | null;
          messageId?: string | null;
          metadata?: Record<string, unknown>;
        }) => {
          try {
            const { recordDifyErrorLog, classifyRawDifyError } = await import(
              "@/lib/dify-error-log.server"
            );
            await recordDifyErrorLog({
              ...logCtx,
              source: "server",
              durationMs: extra.durationMs ?? Date.now() - startedAt,
              errorKind:
                extra.errorKind ?? classifyRawDifyError(extra.rawError ?? null, extra.httpStatus ?? null),
              httpStatus: extra.httpStatus ?? null,
              rawError: extra.rawError ?? null,
              messageId: extra.messageId ?? null,
              metadata: extra.metadata ?? {},
            });
          } catch {
            /* registro é best-effort */
          }
        };

        /**
         * Fim do stream. Regras de classificação:
         *  - erro no meio do stream → registra bruto;
         *  - abaixo de 5s → "execução inexistente" (não houve execução no Dify);
         *  - duração só é critério em mensagem COM ANEXO, com limiar por tarefa,
         *    medida pela latência real do Dify quando disponível;
         *  - mensagem com anexo cuja resposta não traz o array de marcadores
         *    é falha estrutural, independente de duração.
         */
        const onStreamFinished = async (outcome: StreamOutcome, wasRetry = false) => {
          const wallMs = Date.now() - startedAt;
          const durationMs = outcome.providerLatencyMs ?? wallMs;
          const base = {
            provider_latency_ms: outcome.providerLatencyMs,
            wall_ms: wallMs,
            bytes: outcome.bytes,
            message_id: outcome.messageId,
            conversation_id: outcome.conversationId,
            was_retry: wasRetry,
            phase: "stream",
          };
          const mod = await import("@/lib/dify-error-log.server").catch(() => null);
          if (!mod) return; // registro é best-effort
          const { fastResponseThresholdMs, expectsMarkers, NO_EXECUTION_MS, EMPTY_ANSWER_MAX_BYTES } =
            mod;

          // 0. Resposta vazia: vale SEMPRE — sem olhar tarefa, anexo ou duração.
          //    Inclui o caso em que o stream terminou com evento de erro.
          if (outcome.bytes < EMPTY_ANSWER_MAX_BYTES) {
            await logDify({
              errorKind: "empty_answer",
              rawError: outcome.streamError ?? null,
              durationMs,
              messageId: outcome.messageId,
              metadata: {
                ...base,
                had_stream_error: Boolean(outcome.streamError),
                note: "Stream encerrado sem conteúdo útil para a usuária.",
              },
            });
            return;
          }

          if (outcome.streamError) {
            await logDify({
              rawError: outcome.streamError,
              durationMs,
              messageId: outcome.messageId,
              metadata: base,
            });
            return;
          }
          try {
            const hasFile = logCtx.attachmentCount > 0;

            // 1. Execução inexistente: nem chegou a despachar no Dify.
            if (wallMs < NO_EXECUTION_MS && outcome.providerLatencyMs == null) {
              await logDify({
                errorKind: "no_execution",
                rawError: outcome.streamError ?? null,
                durationMs: wallMs,
                messageId: outcome.messageId,
                metadata: {
                  ...base,
                  note: "Resposta concluída em menos de 5s e sem latência de execução do Dify.",
                },
              });
              return;
            }

            // 2. Detector estrutural: SÓ com anexo. Sem anexo há conversa
            //    legítima que começa com {"markers":[]} — seria falso positivo.
            if (hasFile && expectsMarkers(logCtx.selectedTask) && !outcome.sawMarkers) {
              await logDify({
                errorKind: "missing_markers",
                rawError: null,
                durationMs,
                messageId: outcome.messageId,
                metadata: {
                  ...base,
                  note: "Mensagem com anexo cuja resposta não trouxe o array de marcadores.",
                },
              });
              return;
            }

            // 3. Duração, apenas com anexo e com limiar definido para a tarefa.
            const limit = fastResponseThresholdMs(logCtx.selectedTask, hasFile);
            if (limit != null && durationMs < limit) {
              await logDify({
                errorKind: "suspicious_fast",
                rawError: null,
                durationMs,
                messageId: outcome.messageId,
                metadata: {
                  ...base,
                  threshold_ms: limit,
                  note: "Execução concluída sem erro, porém abaixo do tempo esperado para a tarefa.",
                },
              });
            }
          } catch {
            /* registro é best-effort */
          }
        };



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
          void logDify({
            errorKind: e?.name === "AbortError" ? "timeout" : "connection",
            httpStatus: 504,
            rawError: String(e?.stack || e?.message || e),
          });
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

          void logDify({ httpStatus: upstream.status, rawError: text });


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
              const wrapped = wrapStreamWithRelease(upstream.body, (outcome) => {
                releaseStreamSlot(userId).catch(() => {});
                void onStreamFinished(outcome, true);
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
        console.info("[dify-proxy] stream_start", {
          agent: agentType,
          conversation_id: conversation_id ?? null,
          files: Array.isArray(files) ? files.length : 0,
        });
        const wrapped = wrapStreamWithRelease(upstream.body, (outcome) => {
          console.info("[dify-proxy] stream_end", { agent: agentType });
          releaseStreamSlot(userId).catch(() => {});
          void onStreamFinished(outcome);
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
