import { useState } from "react";
import { Copy, Check } from "lucide-react";

/**
 * Converte um nó DOM (HTML já renderizado pelo ReactMarkdown) em texto
 * plano com formatação estilo WhatsApp (*negrito*, _itálico_, ~riscado~,
 * `código`, listas com "- "). Preserva quebras de linha e links como
 * "texto (url)". Mantém compatível com colagem em Word/Google Docs via
 * text/html paralelo no clipboard.
 */
function domToWhatsapp(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();
  const kids = Array.from(el.childNodes).map(domToWhatsapp).join("");

  switch (tag) {
    case "strong":
    case "b":
      return kids.trim() ? `*${kids}*` : kids;
    case "em":
    case "i":
      return kids.trim() ? `_${kids}_` : kids;
    case "s":
    case "del":
    case "strike":
      return kids.trim() ? `~${kids}~` : kids;
    case "code":
      return kids.trim() ? `\`${kids}\`` : kids;
    case "pre":
      return `\n\`\`\`\n${kids}\n\`\`\`\n`;
    case "br":
      return "\n";
    case "hr":
      return "\n---\n";
    case "p":
      return `${kids}\n\n`;
    case "h1":
    case "h2":
    case "h3":
    case "h4":
    case "h5":
    case "h6":
      return `\n*${kids.trim()}*\n\n`;
    case "li": {
      // Numeração se o pai for <ol>
      const parent = el.parentElement;
      if (parent && parent.tagName.toLowerCase() === "ol") {
        const idx = Array.from(parent.children).indexOf(el) + 1;
        return `${idx}. ${kids.trim()}\n`;
      }
      return `- ${kids.trim()}\n`;
    }
    case "ul":
    case "ol":
      return `${kids}\n`;
    case "a": {
      const href = el.getAttribute("href");
      return href && href !== kids ? `${kids} (${href})` : kids;
    }
    case "blockquote":
      return kids
        .split("\n")
        .map((l) => (l ? `> ${l}` : l))
        .join("\n");
    default:
      return kids;
  }
}

function cleanupWhatsapp(text: string): string {
  return text
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

export function MessageCopyButton({ getElement }: { getElement: () => HTMLElement | null }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    const el = getElement();
    if (!el) return;
    const html = el.innerHTML;
    const plain = cleanupWhatsapp(domToWhatsapp(el));

    try {
      if (typeof window !== "undefined" && "ClipboardItem" in window && navigator.clipboard?.write) {
        const item = new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([plain], { type: "text/plain" }),
        });
        await navigator.clipboard.write([item]);
      } else {
        await navigator.clipboard.writeText(plain);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      try {
        await navigator.clipboard.writeText(plain);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        console.error("Falha ao copiar mensagem", e);
      }
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center gap-1 sm:gap-1.5 text-xs px-1.5 sm:px-2 py-1 rounded-md transition-colors hover:bg-black/5 text-muted-foreground"
      aria-label="Copiar mensagem"
      title="Copiar (mantém formatação para Word/Docs e WhatsApp)"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
      <span className="hidden sm:inline">{copied ? "Copiado!" : "Copiar"}</span>
    </button>
  );
}
