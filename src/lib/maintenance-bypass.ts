// Emails autorizados a acessar o sistema mesmo em modo manutenção.
// Uso: testes e validações internas.
export const MAINTENANCE_BYPASS_EMAILS: readonly string[] = [
  "marcos@setupdigital.com.br",
];

export function canBypassMaintenance(
  role: string | null | undefined,
  email: string | null | undefined,
): boolean {
  if (role === "super_admin") return true;
  if (!email) return false;
  return MAINTENANCE_BYPASS_EMAILS.includes(email.trim().toLowerCase());
}
