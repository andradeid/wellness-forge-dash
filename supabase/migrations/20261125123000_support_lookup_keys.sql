-- Senhas da consulta de conta do suporte (/api/public/support-lookup), guardadas só como SHA-256.
-- Assim a senha não precisa ir para o .env do servidor (vale igual no beta e na produção) e pode ser
-- trocada ou revogada direto no banco. A senha em si fica só com quem chama (SIVA).
-- Só o servidor (service role) lê: RLS ligado e sem políticas.
create table if not exists public.support_lookup_keys (
  id uuid primary key default gen_random_uuid(),
  sha256 text not null unique check (sha256 ~ '^[0-9a-f]{64}$'),
  label text not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

alter table public.support_lookup_keys enable row level security;

comment on table public.support_lookup_keys is 'Hash SHA-256 das senhas aceitas em /api/public/support-lookup. revoked_at preenchido = senha desligada.';
