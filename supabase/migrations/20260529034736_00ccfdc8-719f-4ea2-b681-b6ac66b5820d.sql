-- Adiciona política para permitir leitura das configurações do Dify por usuários autenticados
CREATE POLICY "Users can read Dify configuration" 
ON public.integrations 
FOR SELECT 
TO authenticated 
USING (key IN ('dify_endpoint', 'dify_api_key'));
