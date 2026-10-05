import { createFileRoute } from "@tanstack/react-router";

import { PartnersPage } from "@/features/admin/partners/partners-page";

export const Route = createFileRoute("/admin/entreprises")({
  head: () => ({
    meta: [
      { title: "Entreprises partenaires — Espace gérant" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PartnersPage,
});
