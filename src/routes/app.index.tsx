import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/app/")({
  component: AppIndex,
});

function AppIndex() {
  const { role, loading, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading || !user) return;
    if (role === null) return; // wait until role resolved
    if (role === "super_admin") {
      navigate({ to: "/app/admin/nutritionists" });
    } else {
      navigate({ to: "/app/patients" });
    }
  }, [role, loading, user, navigate]);

  return (
    <div className="text-sm text-muted-foreground">Redirecionando...</div>
  );
}
