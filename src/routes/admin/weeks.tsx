import { createFileRoute } from "@tanstack/react-router";

import { WeeksPage } from "@/features/admin/menu-planning/weeks-page";
import { CLIENT } from "@/config/client";

export const Route = createFileRoute("/admin/weeks")({
  head: () => ({
    meta: [
      { title: `Semaines et menus — ${CLIENT.name}` },
      { name: "description", content: "Calendrier et planification des menus du traiteur." },
      { property: "og:title", content: `Semaines et menus — ${CLIENT.name}` },
      { property: "og:description", content: "Calendrier et planification des menus du traiteur." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: WeeksPage,
});
