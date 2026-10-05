import { createFileRoute } from "@tanstack/react-router";

import { OrdersPage } from "@/features/admin/orders/orders-page";
import { CLIENT } from "@/config/client";

export const Route = createFileRoute("/admin/orders")({
  // `?q=CMD-…` pré-remplit la recherche (lien depuis une notification ou le tableau de bord).
  validateSearch: (search: Record<string, unknown>): { q?: string } =>
    typeof search["q"] === "string" ? { q: search["q"] } : {},
  head: () => ({
    meta: [
      { title: `Commandes — ${CLIENT.name}` },
      { name: "description", content: "Suivi des commandes et précommandes du traiteur." },
      { property: "og:title", content: `Commandes — ${CLIENT.name}` },
      { property: "og:description", content: "Suivi des commandes et précommandes du traiteur." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: OrdersPage,
});
