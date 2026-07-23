/**
 * Provisionamento de usuários pós-compra (Stripe/Kiwify).
 *
 * Substitui o antigo fluxo de `inviteUserByEmail`, que dependia de link
 * mágico com validade curta e quebrava em vários clientes de email.
 *
 * Novo fluxo:
 *  - Se já existe em profiles → retorna o id (não envia welcome).
 *  - Se não existe → cria via admin.createUser com senha temporária fixa
 *    + email_confirm:true e marca must_change_password=true no profile.
 *  - Fallback: se createUser diz "already registered" (raro, dessync
 *    auth.users x profiles), localiza via listUsers e reseta a senha.
 *
 * Retorna welcomeNeeded=true apenas quando o usuário foi criado ou teve
 * senha resetada — evita disparar boas-vindas em compras repetidas do
 * mesmo cliente.
 */

export const TEMP_PASSWORD = "Lumma2@102030";

export type ProvisionResult = {
  userId: string | null;
  isNew: boolean;
  welcomeNeeded: boolean;
  tempPassword: string;
};

async function findAuthUserByEmail(
  supabaseAdmin: any,
  email: string,
): Promise<any | null> {
  // Paginação defensiva; para de varrer assim que acha.
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) {
      console.warn("[provisioning] listUsers falhou:", error.message);
      return null;
    }
    const users = data?.users ?? [];
    const found = users.find(
      (u: any) => (u.email ?? "").toLowerCase() === email,
    );
    if (found) return found;
    if (users.length < 200) return null;
  }
  return null;
}

export async function createUserWithTempPassword(
  supabaseAdmin: any,
  args: { email: string; fullName?: string | null },
): Promise<ProvisionResult> {
  const email = args.email.trim().toLowerCase();
  const fullName = args.fullName?.trim() || null;

  // 1) Já existe em profiles? Nunca reenvia welcome nesse caso.
  const { data: prof } = await supabaseAdmin
    .from("profiles" as any)
    .select("id")
    .ilike("email", email)
    .maybeSingle();
  if ((prof as any)?.id) {
    return {
      userId: (prof as any).id as string,
      isNew: false,
      welcomeNeeded: false,
      tempPassword: TEMP_PASSWORD,
    };
  }

  // 2) Tenta criar. O trigger handle_new_user cria profile/role/subscription.
  const userMetadata = fullName
    ? { full_name: fullName, name: fullName }
    : undefined;

  const { data: created, error: createErr } =
    await supabaseAdmin.auth.admin.createUser({
      email,
      password: TEMP_PASSWORD,
      email_confirm: true,
      user_metadata: userMetadata,
    });

  if (created?.user?.id) {
    const userId = created.user.id as string;
    await supabaseAdmin
      .from("profiles" as any)
      .update({ must_change_password: true })
      .eq("id", userId);
    return {
      userId,
      isNew: true,
      welcomeNeeded: true,
      tempPassword: TEMP_PASSWORD,
    };
  }

  // 3) createUser falhou. Se não é "já existe", loga e desiste.
  const msg = createErr?.message ?? "unknown";
  if (!/already|registered|exists/i.test(msg)) {
    console.error("[provisioning] createUser falhou:", msg);
    return {
      userId: null,
      isNew: false,
      welcomeNeeded: false,
      tempPassword: TEMP_PASSWORD,
    };
  }

  // 4) Existe em auth.users mas não em profiles (dessync). Localiza,
  //    reseta senha e força troca no 1º login.
  const authUser = await findAuthUserByEmail(supabaseAdmin, email);
  if (!authUser?.id) {
    console.error(
      "[provisioning] usuário existe em auth mas não foi localizado via listUsers",
      email,
    );
    return {
      userId: null,
      isNew: false,
      welcomeNeeded: false,
      tempPassword: TEMP_PASSWORD,
    };
  }

  const userId = authUser.id as string;
  const hasPassword =
    Boolean(authUser.last_sign_in_at) ||
    Boolean(authUser.encrypted_password) ||
    Boolean(authUser.user_metadata?.password_set);

  if (hasPassword) {
    // Já logou alguma vez → não sobrescrevemos senha.
    // Apenas garantimos profile e devolvemos sem welcome.
    await supabaseAdmin
      .from("profiles" as any)
      .upsert(
        { id: userId, email, full_name: fullName ?? "" },
        { onConflict: "id" },
      );
    return {
      userId,
      isNew: false,
      welcomeNeeded: false,
      tempPassword: TEMP_PASSWORD,
    };
  }

  // Sem senha ativa → reseta para a temporária.
  const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(
    userId,
    { password: TEMP_PASSWORD, email_confirm: true },
  );
  if (updateErr) {
    console.error("[provisioning] updateUserById falhou:", updateErr.message);
    return {
      userId,
      isNew: false,
      welcomeNeeded: false,
      tempPassword: TEMP_PASSWORD,
    };
  }

  await supabaseAdmin
    .from("profiles" as any)
    .upsert(
      {
        id: userId,
        email,
        full_name: fullName ?? "",
        must_change_password: true,
      },
      { onConflict: "id" },
    );

  return {
    userId,
    isNew: false,
    welcomeNeeded: true,
    tempPassword: TEMP_PASSWORD,
  };
}
