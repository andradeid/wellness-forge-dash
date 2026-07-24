/**
 * Cliente mínimo Langfuse (histórico / sob demanda).
 * Credenciais só no servidor: LANGFUSE_PUBLIC_KEY + LANGFUSE_SECRET_KEY.
 */
export type LangfusePeriodStats = {
  configured: boolean;
  baseUrl: string;
  tracesTotal: number | null;
  errorObservations: number | null;
  errorSample: Array<{ traceId: string; name: string; message: string; at: string }>;
  warning?: string;
};

function langfuseAuthHeader(): string | null {
  const pk = process.env.LANGFUSE_PUBLIC_KEY?.trim();
  const sk = process.env.LANGFUSE_SECRET_KEY?.trim();
  if (!pk || !sk) return null;
  return `Basic ${Buffer.from(`${pk}:${sk}`).toString("base64")}`;
}

function langfuseBaseUrl(): string {
  return (process.env.LANGFUSE_BASE_URL?.trim() || "https://us.cloud.langfuse.com").replace(/\/$/, "");
}

async function lfGet<T>(path: string, auth: string): Promise<T> {
  const res = await fetch(`${langfuseBaseUrl()}${path}`, {
    headers: { Authorization: auth, Accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Langfuse ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

export async function fetchLangfusePeriodStats(
  fromIso: string,
  toIso: string,
): Promise<LangfusePeriodStats> {
  const baseUrl = langfuseBaseUrl();
  const auth = langfuseAuthHeader();
  if (!auth) {
    return {
      configured: false,
      baseUrl,
      tracesTotal: null,
      errorObservations: null,
      errorSample: [],
      warning: "LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY não configurados no servidor.",
    };
  }

  try {
    const fromQ = encodeURIComponent(fromIso);
    const toQ = encodeURIComponent(toIso);

    const traces = await lfGet<{
      data?: unknown[];
      meta?: { totalItems?: number };
    }>(`/api/public/traces?limit=1&fromTimestamp=${fromQ}&toTimestamp=${toQ}`, auth);

    const errs = await lfGet<{
      data?: Array<{
        id?: string;
        traceId?: string;
        name?: string;
        statusMessage?: string;
        startTime?: string;
        level?: string;
      }>;
      meta?: { totalItems?: number };
    }>(
      `/api/public/observations?level=ERROR&limit=20&fromStartTime=${fromQ}&toStartTime=${toQ}`,
      auth,
    );

    const errorSample = (errs.data ?? []).slice(0, 8).map((o) => ({
      traceId: o.traceId ?? "",
      name: o.name ?? "observation",
      message: (o.statusMessage ?? "").slice(0, 160),
      at: o.startTime ?? "",
    }));

    return {
      configured: true,
      baseUrl,
      tracesTotal: typeof traces.meta?.totalItems === "number" ? traces.meta.totalItems : (traces.data?.length ?? 0),
      errorObservations:
        typeof errs.meta?.totalItems === "number" ? errs.meta.totalItems : (errs.data?.length ?? 0),
      errorSample,
    };
  } catch (e) {
    return {
      configured: true,
      baseUrl,
      tracesTotal: null,
      errorObservations: null,
      errorSample: [],
      warning: e instanceof Error ? e.message : String(e),
    };
  }
}
