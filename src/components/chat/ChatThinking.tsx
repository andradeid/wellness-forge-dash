import lummaSymbol from "@/assets/lumma-symbol.svg";

export function ChatThinking() {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <img src={lummaSymbol} alt="Lumma" className="h-6 w-6 animate-spin" />
      <span
        className="text-sm font-medium animate-pulse bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] bg-clip-text text-transparent"
      >
        Aguarde, Lumma está raciocinando…
      </span>
    </div>
  );
}
