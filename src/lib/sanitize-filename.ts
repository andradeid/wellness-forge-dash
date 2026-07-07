/**
 * Sanitiza um nome de arquivo para uso como key no Supabase Storage.
 *
 * O Storage rejeita chaves fora de um subset restrito de caracteres
 * (colchetes, parênteses, acentos, espaços duplos, etc. quebram com
 * "Invalid key"). Esta função:
 *  - remove acentos (NFD + strip diacríticos)
 *  - troca qualquer caractere fora de [A-Za-z0-9._-] por "_"
 *  - colapsa "_" repetidos e apara nas pontas
 *  - preserva a extensão (última "." + ext), sanitizando-a também
 *  - garante um nome mínimo ("arquivo") quando o input fica vazio
 *
 * NÃO adiciona timestamp / prefixo — quem chama monta a key completa
 * (ex.: `${userId}/${Date.now()}-${sanitizeFilename(file.name)}`).
 */
export function sanitizeFilename(name: string): string {
  const clean = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Za-z0-9._-]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "");

  const raw = String(name ?? "");
  const dot = raw.lastIndexOf(".");
  const base = dot > 0 ? raw.slice(0, dot) : raw;
  const ext = dot > 0 ? raw.slice(dot + 1) : "";

  const safeBase = clean(base) || "arquivo";
  const safeExt = clean(ext);
  return safeExt ? `${safeBase}.${safeExt}` : safeBase;
}

/**
 * Sanitiza apenas a extensão (para casos em que a key usa só `.${ext}`,
 * como avatars/logos que salvam como `${timestamp}.${ext}`).
 */
export function sanitizeExtension(ext: string): string {
  return String(ext ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "")
    .toLowerCase();
}
