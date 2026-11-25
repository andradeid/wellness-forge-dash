-- Liga/desliga a página pública /planos e os botões "Planos" no site e no login.
-- Começa desligada (aguardando aprovação da Ana). Para ligar: update system_settings set public_plans_enabled = true;
alter table public.system_settings add column if not exists public_plans_enabled boolean not null default false;
comment on column public.system_settings.public_plans_enabled is 'Página pública /planos e botões "Planos" no site e no login. false = escondida (quem abrir /planos vai para o login).';
