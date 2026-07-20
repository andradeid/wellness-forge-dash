import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

const WHATSAPP_NUMBER = "5519997285302";
const WHATSAPP_MESSAGE = "Oi! Você pode me ajudar com com a LUMMA 2.0?";
const WHATSAPP_URL = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(WHATSAPP_MESSAGE)}`;

export function SupportWidget() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return createPortal(
    <a
      href={WHATSAPP_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full bg-[#25D366] text-white shadow-xl flex items-center justify-center hover:scale-105 transition-transform group"
      aria-label="Falar no WhatsApp com o suporte LUMMA"
      title="Falar no WhatsApp"
    >
      <span className="absolute inset-0 rounded-full bg-[#25D366]/40 animate-ping opacity-60 group-hover:opacity-0" />
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 32 32"
        fill="currentColor"
        className="h-7 w-7 relative"
        aria-hidden="true"
      >
        <path d="M19.11 17.205c-.372 0-1.088 1.39-1.518 1.39a.63.63 0 0 1-.315-.1c-.802-.402-1.504-.817-2.163-1.447-.545-.516-1.146-1.29-1.46-1.963a.426.426 0 0 1-.073-.215c0-.33.99-.945.99-1.49 0-.143-.73-2.09-.832-2.335-.143-.372-.214-.487-.6-.487-.187 0-.36-.043-.53-.043-.302 0-.53.115-.746.315-.688.645-1.032 1.318-1.06 2.264v.114c-.015.99.472 1.977 1.017 2.78 1.23 1.82 2.506 3.41 4.554 4.34.616.287 2.035.888 2.722.888.817 0 2.335-.516 2.664-1.32.13-.315.13-.573.13-.888 0-.216-.058-.303-.244-.416-.187-.115-1.16-.573-1.532-.688M16.15 27.85c-1.677 0-3.32-.446-4.76-1.263l-.34-.2-3.526.926.94-3.44-.216-.357c-.9-1.418-1.376-3.076-1.376-4.786a8.86 8.86 0 0 1 8.98-8.94 8.94 8.94 0 0 1 8.982 8.94 8.94 8.94 0 0 1-8.686 9.12m0-19.708c-5.79 0-10.55 4.71-10.55 10.508 0 1.792.53 3.53 1.376 5.084L5.5 30.375l6.85-1.734c1.492.827 3.176 1.283 4.9 1.283a10.55 10.55 0 0 0 10.549-10.55A10.55 10.55 0 0 0 16.15 8.142" />
      </svg>
    </a>,
    document.body,
  );
}
