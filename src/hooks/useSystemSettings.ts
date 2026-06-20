import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface SystemSettings {
  id: string;
  seo_title: string | null;
  seo_description: string | null;
  seo_canonical: string | null;
  sitemap_extra: string | null;
  site_description: string | null;
  timezone: string;
  maintenance_enabled: boolean;
  maintenance_html: string;
  updated_at: string;
  updated_by: string | null;
}

const QUERY_KEY = ["system_settings"];

async function fetchSettings(): Promise<SystemSettings | null> {
  const { data, error } = await (supabase as any)
    .from("system_settings")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.warn("[system_settings] fetch error", error);
    return null;
  }
  return (data as SystemSettings | null) ?? null;
}

export function useSystemSettings() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchSettings,
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
  });
}

export function useUpdateSystemSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<SystemSettings> & { id: string }) => {
      const { id, ...rest } = patch;
      const { data: userData } = await supabase.auth.getUser();
      const { data, error } = await (supabase as any)
        .from("system_settings")
        .update({ ...rest, updated_by: userData.user?.id ?? null })
        .eq("id", id)
        .select()
        .maybeSingle();
      if (error) throw error;
      return data as SystemSettings;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}
