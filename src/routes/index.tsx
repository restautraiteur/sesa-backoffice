import { createFileRoute, redirect } from "@tanstack/react-router";

// L'espace gérant commence au tableau de bord.
export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/admin" });
  },
});
