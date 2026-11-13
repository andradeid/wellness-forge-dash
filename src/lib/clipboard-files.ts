/**
 * Colar arquivo direto no chat (Ctrl+V / Cmd+V / "Colar" no celular).
 *
 * Regras:
 * - imagem copiada (print, "Copiar imagem" no navegador, recorte do Windows/Mac) vira anexo;
 * - PDF/imagem copiado no explorador de arquivos também vira anexo, quando o navegador entrega o arquivo;
 * - se a área de transferência também traz texto (ex.: células do Excel, trecho do Word), cola o
 *   TEXTO normalmente e não anexa: Excel e Word mandam junto uma "foto" do trecho, que não é o que
 *   a pessoa quis colar;
 * - prints colados chegam todos como "image.png": cada um ganha um nome próprio, senão remover
 *   um anexo removeria os outros com o mesmo nome.
 */

/** O que o paste deve fazer: anexar estes arquivos, ou deixar o navegador colar o texto. */
export function filesFromClipboard(data: Pick<DataTransfer, "items" | "files" | "getData"> | null | undefined): File[] {
  if (!data) return [];
  let text = "";
  try {
    text = data.getData("text/plain") ?? "";
  } catch {
    text = "";
  }
  if (text.trim()) return [];

  const out: File[] = [];
  const items = Array.from(data.items ?? []);
  for (const item of items) {
    if (item.kind !== "file") continue;
    const f = item.getAsFile();
    if (f) out.push(f);
  }
  // Alguns navegadores só preenchem "files".
  if (!out.length) out.push(...Array.from(data.files ?? []));
  return out;
}

const EXT_BY_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/bmp": "bmp",
  "application/pdf": "pdf",
};

function stamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/** Nome genérico de print colado ("image.png", sem nome) → "imagem-colada-AAAAMMDD-HHMMSS[-n].ext". */
export function isGenericPastedName(name: string | undefined | null): boolean {
  const n = (name ?? "").trim().toLowerCase();
  return !n || /^image\.(png|jpe?g|webp|gif|bmp)$/.test(n) || n === "blob";
}

/**
 * Renomeia prints colados para nomes únicos (não repete os nomes já anexados).
 * Arquivos com nome de verdade (ex.: "exame-joana.pdf") ficam como estão.
 */
export function namePastedFiles(files: File[], taken: Iterable<string> = [], now: Date = new Date()): File[] {
  const used = new Set(taken);
  return files.map((f) => {
    if (!isGenericPastedName(f.name) && !used.has(f.name)) {
      used.add(f.name);
      return f;
    }
    const type = f.type || "image/png";
    const ext = EXT_BY_TYPE[type.toLowerCase()] ?? (f.name.split(".").pop() || "png");
    const base = isGenericPastedName(f.name) ? `imagem-colada-${stamp(now)}` : f.name.replace(/\.[^.]+$/, "");
    let name = `${base}.${ext}`;
    for (let i = 2; used.has(name); i++) name = `${base}-${i}.${ext}`;
    used.add(name);
    return new File([f], name, { type, lastModified: f.lastModified || now.getTime() });
  });
}
