import { createFileRoute } from "@tanstack/react-router";

import { Dashboard } from "@/features/admin/dashboard/dashboard-page";
import { CLIENT } from "@/config/client";

export const Route = createFileRoute("/admin/")({
  head: () => ({
    meta: [
      { title: `Tableau de bord — ${CLIENT.name}` },
      { name: "description", content: "Production, commandes et stocks du service traiteur." },
      { property: "og:title", content: `Tableau de bord — ${CLIENT.name}` },
      {
        property: "og:description",
        content: "Production, commandes et stocks du service traiteur.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});
