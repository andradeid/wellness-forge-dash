import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";

const FALLBACK_BASE = "https://beta.lumma.ia.br";
const FALLBACK_URL = "https://bidarktpgytizdgmmqrg.supabase.co";
const FALLBACK_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJpZGFya3RwZ3l0aXpkZ21tcXJnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzNDg2NzgsImV4cCI6MjA5MzkyNDY3OH0.l4vRyyKIfSozA6-3WkbrkEO1mvDHMjme71w8_XZWjNg";

const STATIC_PATHS = ["/", "/login"];

function xmlEscape(s: string) {
  return s.replace(/[<>&'"]/g, (c) =>
    c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === "&" ? "&amp;" : c === "'" ? "&apos;" : "&quot;",
  );
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const url = process.env.SUPABASE_URL || FALLBACK_URL;
        const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || FALLBACK_KEY;

        let base = FALLBACK_BASE;
        let extras: string[] = [];

        try {
          const supa = createClient(url, key, { auth: { persistSession: false } });
          const { data } = await supa
            .from("system_settings")
            .select("seo_canonical, sitemap_extra")
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (data?.seo_canonical) base = data.seo_canonical.replace(/\/$/, "");
          if (data?.sitemap_extra) {
            extras = data.sitemap_extra
              .split(/\r?\n/)
              .map((s: string) => s.trim())
              .filter(Boolean);
          }
        } catch {
          // ignore, use defaults
        }

        const urls = new Set<string>();
        for (const p of STATIC_PATHS) urls.add(`${base}${p}`);
        for (const e of extras) urls.add(e);

        const body = [
          '<?xml version="1.0" encoding="UTF-8"?>',
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
          ...Array.from(urls).map((u) => `  <url><loc>${xmlEscape(u)}</loc></url>`),
          "</urlset>",
        ].join("\n");

        return new Response(body, {
          headers: {
            "Content-Type": "application/xml; charset=utf-8",
            "Cache-Control": "public, max-age=600",
          },
        });
      },
    },
  },
});
