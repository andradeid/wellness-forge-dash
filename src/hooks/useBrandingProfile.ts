import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface BrandingProfile {
  pronoun: string | null;
  full_name: string | null;
  professional_id: string | null;
  clinic_name: string | null;
  clinic_logo_url: string | null;
  email: string | null;
  phone: string | null;
}

export const PRONOUN_OPTIONS = [
  { value: "Dra.", label: "Dra." },
  { value: "Dr.", label: "Dr." },
  { value: "Nutri", label: "Nutri" },
  { value: "Especialista", label: "Especialista" },
];

export function useBrandingProfile(userId: string | null | undefined) {
  const [data, setData] = useState<BrandingProfile | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    (async () => {
      const { data } = await (supabase as any)
        .from("profiles")
        .select(
          "pronoun, full_name, professional_id, clinic_name, clinic_logo_url, email, phone",
        )
        .eq("id", userId)
        .maybeSingle();
      setData((data as BrandingProfile) ?? null);
      setLoading(false);
    })();
  }, [userId]);

  return { data, loading };
}
