/**
 * Consulta de conta para o atendimento (agente de suporte no SIVA). Só leitura.
 *
 * Regra de privacidade (decidida com o Marcos em 25/11/2026):
 *  - Com o e-mail, responde só se a conta existe e se a pessoa já fez o primeiro acesso
 *    (o mesmo que a tela "Esqueceu a senha ou é seu primeiro acesso?" já revela).
 *  - Plano, situação, validade e créditos só quando o WhatsApp de quem pergunta é o mesmo
 *    telefone cadastrado na conta.
 *  - Nunca devolve pacientes, exames, CPF, pagamentos nem dados de outra conta.
 */

export interface LookupAccount {
  email: string;
  phone: string | null;
  isBlocked: boolean;
  deleted: boolean;
  lastSignInAt: string | null;
  mustChangePassword: boolean | null;
  subscription: {
    status: "trial" | "active" | "past_due" | "canceled" | string;
    planType: string | null;
    origin: string | null;
    currentPeriodEnd: string | null;
    unlimitedCredits: boolean | null;
  } | null;
  planName: string | null;
  credits: { balance: number | null; monthlyQuota: number | null; packBalance: number | null; quotaResetAt: string | null } | null;
}

export interface LookupResponse {
  encontrada: boolean;
  primeiro_acesso_feito?: boolean;
  conta_bloqueada?: boolean;
  telefone_confere?: boolean;
  plano?: string | null;
  situacao?: "ativa" | "teste" | "pagamento_pendente" | "vencida" | "cancelada" | "sem_plano";
  valida_ate?: string | null;
  creditos_ilimitados?: boolean;
  creditos?: { saldo: number; cota_mensal: number; avulsos: number; renova_em: string | null } | null;
  origem?: string | null;
  orientacao: string;
}

/** Só os dígitos, sem o 55 do Brasil quando vier com DDI. */
function brDigits(v: string | null | undefined): string {
  let d = String(v ?? "").replace(/\D/g, "");
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2);
  return d;
}

/**
 * Mesmo telefone? Compara DDD + os 8 últimos dígitos (ignora o 9 a mais do celular, que o WhatsApp
 * às vezes omite). Exige DDD dos dois lados: número sem DDD não confere.
 */
export function samePhone(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = brDigits(a);
  const y = brDigits(b);
  if (x.length < 10 || y.length < 10) return false;
  return x.slice(0, 2) === y.slice(0, 2) && x.slice(-8) === y.slice(-8);
}

const ORIGEM: Record<string, string> = {
  migracao_lumma1: "Migrada da Lumma 1 / Black 2025",
  kiwify: "Compra pela Kiwify",
  stripe: "Assinatura no site (cartão)",
  tmb: "Compra pela TMB",
  hubla: "Compra pela Hubla",
  ajuste_manual_hubla: "Compra pela Hubla",
  manual: "Liberada pela equipe",
  sorteio: "Sorteio",
  interno: "Interna",
};

const ymd = (iso: string | null | undefined) => (iso ? String(iso).slice(0, 10) : null);

function situacao(sub: LookupAccount["subscription"], now: Date): NonNullable<LookupResponse["situacao"]> {
  if (!sub) return "sem_plano";
  if (sub.status === "canceled") return "cancelada";
  const end = sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : null;
  if (end && end.getTime() < now.getTime()) return "vencida";
  if (sub.status === "past_due") return "pagamento_pendente";
  if (sub.status === "trial") return "teste";
  return "ativa";
}

export function buildLookupResponse(acc: LookupAccount | null, whatsappPhone: string | null | undefined, now: Date = new Date()): LookupResponse {
  if (!acc || acc.deleted) {
    return {
      encontrada: false,
      orientacao: "Nenhuma conta com este e-mail. Pergunte se a compra foi feita com outro e-mail; se não achar, transfira para a equipe.",
    };
  }
  const primeiro = !!acc.lastSignInAt;
  const base: LookupResponse = {
    encontrada: true,
    primeiro_acesso_feito: primeiro,
    conta_bloqueada: acc.isBlocked,
    telefone_confere: samePhone(whatsappPhone, acc.phone),
    orientacao: "",
  };
  if (acc.isBlocked) {
    return { ...base, orientacao: "Conta bloqueada pela equipe. Não oriente acesso: transfira para a equipe." };
  }
  if (!base.telefone_confere) {
    return {
      ...base,
      orientacao: primeiro
        ? "A conta existe e já foi usada. Oriente 'Esqueceu a senha ou é seu primeiro acesso?' com este e-mail. Não informe plano, validade nem créditos: o WhatsApp não é o telefone da conta; se a pessoa precisar disso, transfira."
        : "A conta existe e ainda não teve o primeiro acesso. Passe o passo a passo do primeiro acesso com este e-mail. Não informe plano, validade nem créditos: o WhatsApp não é o telefone da conta.",
    };
  }
  const sit = situacao(acc.subscription, now);
  const c = acc.credits;
  const full: LookupResponse = {
    ...base,
    plano: acc.planName,
    situacao: sit,
    valida_ate: ymd(acc.subscription?.currentPeriodEnd),
    creditos_ilimitados: !!acc.subscription?.unlimitedCredits,
    creditos: c ? { saldo: Math.max(0, c.balance ?? 0), cota_mensal: c.monthlyQuota ?? 0, avulsos: Math.max(0, c.packBalance ?? 0), renova_em: ymd(c.quotaResetAt) } : null,
    origem: acc.subscription?.origin ? (ORIGEM[acc.subscription.origin] ?? null) : null,
    orientacao: "",
  };
  full.orientacao =
    sit === "ativa" || sit === "teste"
      ? primeiro
        ? "Conta ativa e já usada. Para acesso: 'Esqueceu a senha ou é seu primeiro acesso?' ou sair e entrar de novo. Pode informar plano, validade e créditos."
        : "Conta ativa, ainda sem o primeiro acesso. Passe o passo a passo do primeiro acesso. Pode informar plano, validade e créditos."
      : "Conta sem plano em dia (" + sit + "). Não prometa liberação: explique a regra geral e transfira para a equipe.";
  return full;
}
