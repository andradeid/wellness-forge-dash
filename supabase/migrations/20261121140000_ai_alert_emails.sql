-- E-mails extras para os alertas da trava de IA (editável em Admin → Sistema → Manutenção).
alter table public.system_settings add column if not exists alert_emails text;
comment on column public.system_settings.alert_emails is 'E-mails extras (um por linha ou separados por vírgula) que recebem os alertas da trava de IA. O Master Admin recebe sempre.';
