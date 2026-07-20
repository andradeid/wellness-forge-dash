GRANT SELECT ON public.payment_history TO authenticated;
GRANT ALL ON public.payment_history TO service_role;

GRANT SELECT, INSERT ON public.credit_transactions TO authenticated;
GRANT ALL ON public.credit_transactions TO service_role;