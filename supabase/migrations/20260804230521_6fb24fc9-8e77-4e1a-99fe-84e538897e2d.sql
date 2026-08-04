DELETE FROM public.curation_requests 
WHERE created_by IN (SELECT id FROM auth.users WHERE email = 'curadoria@lumma.ia.br')
AND (
    title ILIKE '%teste%' 
    OR title = 'Reportar imagem em anexo na curadoria'
);