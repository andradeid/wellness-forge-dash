import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/app/")({
  component: AppIndex,
});

function AppIndex() {
  const { role, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (role === "super_admin") {
      navigate({ to: "/app/admin/nutritionists" });
    } else {
      navigate({ to: "/app/patients" });
    }
  }, [role, loading, navigate]);

  return (
    <div className="text-sm text-muted-foreground">Redirecionando...</div>
  );
}
