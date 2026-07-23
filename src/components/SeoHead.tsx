import { useEffect } from "react";
import { useSystemSettings } from "@/hooks/useSystemSettings";

function upsertMeta(attr: "name" | "property", key: string, content: string) {
  if (!content) return;
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function upsertCanonical(href: string) {
  if (!href) return;
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", "canonical");
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

/**
 * Aplica em runtime os metadados de SEO configurados em /app/admin/system.
 * Sobrescreve os defaults do __root quando há valores no banco.
 */
export function SeoHead() {
  const { data } = useSystemSettings();

  useEffect(() => {
    if (!data) return;
    if (typeof document === "undefined") return;

    if (data.seo_title) {
      document.title = data.seo_title;
      upsertMeta("property", "og:title", data.seo_title);
      upsertMeta("name", "twitter:title", data.seo_title);
    }
    if (data.seo_description) {
      upsertMeta("name", "description", data.seo_description);
      upsertMeta("property", "og:description", data.seo_description);
      upsertMeta("name", "twitter:description", data.seo_description);
    }
    if (data.seo_canonical) {
      upsertCanonical(data.seo_canonical);
      upsertMeta("property", "og:url", data.seo_canonical);
    }
  }, [data?.seo_title, data?.seo_description, data?.seo_canonical]);

  return null;
}
