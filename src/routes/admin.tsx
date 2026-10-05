import { createFileRoute } from "@tanstack/react-router";

import { AdminLayout } from "@/features/admin/layout/admin-layout";
import { CLIENT } from "@/config/client";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Back-office gérant — Traiteur" },
      { name: "description", content: "Gestion des semaines, produits, stocks et commandes." },
      { property: "og:title", content: "Back-office gérant — Traiteur" },
      { property: "og:description", content: "Administration du service traiteur." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
      // Permet d'ajouter l'espace gérant à l'écran d'accueil (indispensable pour les notifications sur iPhone).
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: `${CLIENT.name} · Gérant` },
      { name: "theme-color", content: "#ffffff" },
    ],
    links: [{ rel: "manifest", href: "/admin.webmanifest" }],
  }),
  component: AdminLayout,
});
