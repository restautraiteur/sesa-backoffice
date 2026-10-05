import { createFileRoute } from "@tanstack/react-router";

import { ReportsPage } from "@/features/admin/reports/reports-page";
import { CLIENT } from "@/config/client";

export const Route = createFileRoute("/admin/reports")({
  head: () => ({
    meta: [
      { title: `Bilan de la semaine — ${CLIENT.name}` },
      { name: "description", content: "Ventes, plats les plus vendus et quantités à ajuster." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ReportsPage,
});
