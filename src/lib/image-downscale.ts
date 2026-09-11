/**
 * Reamostragem de imagens no envio.
 *
 * Fotos de composição corporal chegam com 8–12 MB (PNG direto da câmera).
 * Esse tamanho não acrescenta nada à análise e encarece todo o caminho
 * (upload, storage, download pelo Dify). Reduzimos para no máximo 1500px no
 * lado maior e convertemos para JPEG — tipicamente < 1 MB.
 *
 * Regras defensivas:
 * - só imagens raster comuns (jpeg/png/webp); HEIC, GIF e SVG passam intactos;
 * - PDFs e demais documentos passam intactos;
 * - qualquer falha de decodificação retorna o arquivo original (nunca bloqueia
 *   o envio da nutricionista);
 * - se o resultado não ficar menor que o original, mantemos o original.
 */

export const MAX_IMAGE_EDGE_PX = 1500;
const JPEG_QUALITY = 0.85;
const DOWNSCALABLE_MIME = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);
/** Abaixo disso não vale a pena reprocessar. */
const MIN_SIZE_BYTES = 1_200_000;

export interface DownscaleResult {
  file: File;
  /** true quando a imagem foi efetivamente reamostrada. */
  changed: boolean;
  originalSize: number;
  finalSize: number;
}

export async function downscaleImageFile(file: File): Promise<DownscaleResult> {
  const unchanged: DownscaleResult = {
    file,
    changed: false,
    originalSize: file.size,
    finalSize: file.size,
  };

  if (typeof document === "undefined") return unchanged;
  if (!DOWNSCALABLE_MIME.has((file.type || "").toLowerCase())) return unchanged;

  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = bitmap;
    const largest = Math.max(width, height);

    // Já é pequena o bastante em pixels E em bytes → não mexe.
    if (largest <= MAX_IMAGE_EDGE_PX && file.size <= MIN_SIZE_BYTES) {
      bitmap.close?.();
      return unchanged;
    }

    const scale = largest > MAX_IMAGE_EDGE_PX ? MAX_IMAGE_EDGE_PX / largest : 1;
    const targetW = Math.max(1, Math.round(width * scale));
    const targetH = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close?.();
      return unchanged;
    }
    // Fundo branco: JPEG não tem alfa; sem isso PNG transparente vira preto.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, targetW, targetH);
    ctx.drawImage(bitmap, 0, 0, targetW, targetH);
    bitmap.close?.();

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), "image/jpeg", JPEG_QUALITY);
    });
    if (!blob || blob.size >= file.size) return unchanged;

    const newName = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    const out = new File([blob], newName, {
      type: "image/jpeg",
      lastModified: file.lastModified,
    });
    return { file: out, changed: true, originalSize: file.size, finalSize: out.size };
  } catch (e) {
    console.warn("[image-downscale] falhou, enviando original:", e);
    return unchanged;
  }
}

/** Aplica a reamostragem em lote, preservando a ordem. */
export async function downscaleImageFiles(files: File[]): Promise<DownscaleResult[]> {
  const out: DownscaleResult[] = [];
  for (const f of files) out.push(await downscaleImageFile(f));
  return out;
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1000))} KB`;
}
