/**
 * Nomes (minúsculos) dos arquivos que já foram ANALISADOS com sucesso na conversa.
 *
 * Um anexo só conta como analisado quando a mensagem da nutricionista recebeu resposta da Lumma
 * sem erro. Se a análise falhou (ex.: PDF e foto misturados, instabilidade), nada foi cobrado e o
 * reenvio do mesmo arquivo não deve mostrar o aviso "Este arquivo já foi analisado nesta conversa".
 */
type MsgLike = {
  role: string;
  attachments?: unknown;
  structured_data?: { error?: unknown } | null;
};

export function analyzedFileNames(messages: MsgLike[]): Set<string> {
  const set = new Set<string>();
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (m.role !== "user") continue;
    const reply = messages[i + 1];
    if (!reply || reply.role !== "assistant" || reply.structured_data?.error === true) continue;
    for (const a of (Array.isArray(m.attachments) ? m.attachments : []) as Array<{ name?: string }>) {
      if (a?.name) set.add(a.name.trim().toLowerCase());
    }
  }
  return set;
}
