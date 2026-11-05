/**
 * Preferência do aviso de novidade do Lumma Play.
 *
 * Regra: o aviso abre em todo acesso, exceto quando o usuário marcou
 * "Não mostrar novamente" (persistido em localStorage).
 */
export const LUMMA_PLAY_NEVER_KEY = "lumma-play-announcement-never";

type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

function storage(): StorageLike | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function shouldShowLummaPlayAnnouncement(): boolean {
  const s = storage();
  if (!s) return true;
  try {
    return s.getItem(LUMMA_PLAY_NEVER_KEY) !== "1";
  } catch {
    return true;
  }
}

export function setLummaPlayNeverShow(never: boolean): void {
  const s = storage();
  if (!s) return;
  try {
    if (never) s.setItem(LUMMA_PLAY_NEVER_KEY, "1");
    else s.removeItem(LUMMA_PLAY_NEVER_KEY);
  } catch {
    /* navegador sem storage disponível: preferência não persiste */
  }
}
