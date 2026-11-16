/**
 * Canal oficial de suporte da Lumma (WhatsApp).
 *
 * Toda mensagem já sai com uma frase que diz de onde a pessoa veio, para o suporte
 * saber na hora: botão dentro do sistema, link do Instagram (/suporte), e-mail etc.
 * Para trocar o número, mude só SUPPORT_WHATSAPP_NUMBER.
 */
export const SUPPORT_WHATSAPP_NUMBER = "5561995132079";

/** Link sem texto pronto (usado onde a mensagem não importa). */
export const SUPPORT_WHATSAPP_URL = `https://wa.me/${SUPPORT_WHATSAPP_NUMBER}`;

const ORIGIN_TEXT: Record<string, string> = {
  sistema: "Olá! Vim pelo botão de suporte do sistema Lumma e preciso de ajuda.",
  instagram: "Olá! Vim pelo link do Instagram da Lumma e quero falar com o suporte.",
  email: "Olá! Vim pelo e-mail da Lumma e preciso de ajuda com minha conta.",
};

/** Origem livre vinda da URL (/suporte?origem=...): só letras, números e hífen. */
export function normalizeSupportOrigin(raw: string | null | undefined, fallback = "instagram"): string {
  const s = (raw ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
  return s || fallback;
}

/** Texto que abre a conversa no WhatsApp, já dizendo de onde a pessoa veio. */
export function supportMessage(origem: string = "sistema", email?: string | null): string {
  const base =
    ORIGIN_TEXT[origem] ?? `Olá! Vim pelo link de suporte da Lumma (${origem}) e quero falar com o suporte.`;
  return email ? `${base}\nMeu e-mail de acesso: ${email}` : base;
}

/** Link do WhatsApp do suporte com a mensagem pronta. */
export function supportWhatsAppUrl(origem: string = "sistema", email?: string | null): string {
  return `https://wa.me/${SUPPORT_WHATSAPP_NUMBER}?text=${encodeURIComponent(supportMessage(origem, email))}`;
}
