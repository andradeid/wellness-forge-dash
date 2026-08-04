-- Desbanir o usuário silvanastutz@hotmail.com
UPDATE auth.users 
SET banned_until = NULL 
WHERE email = 'silvanastutz@hotmail.com';

-- Garantir que o perfil não está marcado como bloqueado
UPDATE public.profiles 
SET is_blocked = false 
WHERE email = 'silvanastutz@hotmail.com';