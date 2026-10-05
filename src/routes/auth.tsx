import { createFileRoute } from "@tanstack/react-router";

import { AuthPage } from "@/features/auth/auth-page";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Espace gérant — Connexion" },
      {
        name: "description",
        content: "Connexion sécurisée au back-office du service traiteur.",
      },
      { property: "og:title", content: "Espace gérant — Connexion" },
      { property: "og:description", content: "Accès réservé au gérant du service traiteur." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});
