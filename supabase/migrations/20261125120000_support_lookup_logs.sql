-- Registro das consultas de conta feitas pelo agente de suporte (SIVA) em /api/public/support-lookup.
-- Só o servidor (service role) grava e lê: RLS ligado e sem políticas.
create table if not exists public.support_lookup_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  email text not null,
  found boolean not null,
  phone_match boolean not null default false,
  detail_returned boolean not null default false,
  whatsapp text,
  conversation_ref text,
  source text
);

alter table public.support_lookup_logs enable row level security;

create index if not exists support_lookup_logs_created_at_idx on public.support_lookup_logs (created_at desc);
create index if not exists support_lookup_logs_email_idx on public.support_lookup_logs (email);

comment on table public.support_lookup_logs is 'Consultas de conta feitas pelo atendimento (SIVA). Sem dados clínicos.';
