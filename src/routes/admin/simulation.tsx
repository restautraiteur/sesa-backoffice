import { createFileRoute } from "@tanstack/react-router";

import { SimulationPage } from "@/features/admin/simulation/simulation-page";
import { CLIENT } from "@/config/client";

export const Route = createFileRoute("/admin/simulation")({
  head: () => ({
    meta: [
      { title: `Simulation — ${CLIENT.name}` },
      {
        name: "description",
        content: "Quantités d'ingrédients et dépenses à prévoir selon les recettes.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SimulationPage,
});
