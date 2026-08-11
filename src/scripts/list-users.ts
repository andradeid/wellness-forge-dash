import { supabaseAdmin } from "../integrations/supabase/client.server";

async function main() {
  const { data: userList, error: listError } = await supabaseAdmin.auth.admin.listUsers();
  
  if (listError) {
    console.error("Erro ao listar usuários:", listError.message);
    process.exit(1);
  }

  console.log("Usuários disponíveis:");
  userList?.users.forEach((u: any) => console.log(`- ${u.email} (${u.id})`));
}

main().catch(console.error);
