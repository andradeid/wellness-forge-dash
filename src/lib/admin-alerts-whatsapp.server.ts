/**
 * Alerta interno por WhatsApp, enviado pelo número do suporte da Lumma
 * conectado no SIVA (workspace "Lumma Suporte"), via API do SIVA
 * (POST {siva_alert_api_url}/messages/send, header X-API-Key).
 *
 * Destinatários: Admin → Sistema → Manutenção → "WhatsApp para alertas da IA"
 * (system_settings.alert_whatsapp, um número por linha, com DDD).
 * Chave e endereço ficam em integrations (siva_alert_api_key / siva_alert_api_url).
 * Nunca lança.
 */

/** "61 99400-9368", "(61)994009368", "+55 61 ..." → "+5561994009368" (ou null). */
export function normalizeBrWhatsapp(raw: string): string | null {
  let d = raw.replace(/\D/g, "");
  if (!d) return null;
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  if (!/^[1-9]\d{11,14}$/.test(d)) return null;
  return `+${d}`;
}

export function parseWhatsappList(text: string | null | undefined): string[] {
  const out = new Set<string>();
  for (const part of (text ?? "").split(/[\n,;]+/)) {
    const n = normalizeBrWhatsapp(part.trim());
    if (n) out.add(n);
  }
  return [...out];
}

export async function sendAdminAlertWhatsApp(text: string): Promise<{ sent: number; total: number }> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const sb = supabaseAdmin as any;
    const { data: st } = await sb
      .from("system_settings")
      .select("alert_whatsapp")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const numbers = parseWhatsappList(st?.alert_whatsapp);
    if (!numbers.length) return { sent: 0, total: 0 };

    const { data: rows } = await sb
      .from("integrations")
      .select("key, value")
      .in("key", ["siva_alert_api_key", "siva_alert_api_url"]);
    const get = (k: string) => (rows ?? []).find((r: any) => r.key === k)?.value?.trim() ?? "";
    const apiKey = get("siva_alert_api_key");
    const baseUrl = get("siva_alert_api_url").replace(/\/$/, "");
    if (!apiKey || !baseUrl) {
      console.warn("[alert-whatsapp] chave ou endereço da API do SIVA ausente");
      return { sent: 0, total: numbers.length };
    }

    let sent = 0;
    for (const phone of numbers) {
      try {
        const res = await fetch(`${baseUrl}/messages/send`, {
          method: "POST",
          headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
          body: JSON.stringify({ phone_e164: phone, text, name: "Alerta Lumma" }),
        });
        if (res.ok) sent++;
        else console.warn("[alert-whatsapp] falhou", phone.slice(0, 6), res.status, (await res.text()).slice(0, 200));
      } catch (e: any) {
        console.warn("[alert-whatsapp] erro de rede:", e?.message);
      }
    }
    return { sent, total: numbers.length };
  } catch (e: any) {
    console.warn("[alert-whatsapp] falhou (ignorado):", e?.message);
    return { sent: 0, total: 0 };
  }
}
