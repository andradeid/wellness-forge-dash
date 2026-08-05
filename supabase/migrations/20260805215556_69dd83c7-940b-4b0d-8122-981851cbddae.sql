REVOKE ALL ON FUNCTION public.admin_dashboard_stats(timestamp with time zone, timestamp with time zone) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_dashboard_stats(timestamp with time zone, timestamp with time zone) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_dashboard_stats(timestamp with time zone, timestamp with time zone) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_dashboard_stats(timestamp with time zone, timestamp with time zone) TO service_role;