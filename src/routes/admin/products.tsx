import { createFileRoute } from "@tanstack/react-router";

import { ProductsPage } from "@/features/admin/products/products-page";
import { CLIENT } from "@/config/client";

export const Route = createFileRoute("/admin/products")({
  head: () => ({
    meta: [
      { title: `Catalogue de produits — ${CLIENT.name}` },
      { name: "description", content: "Catalogue des plats et jus du traiteur." },
      { property: "og:title", content: `Catalogue de produits — ${CLIENT.name}` },
      { property: "og:description", content: "Catalogue des plats et jus du traiteur." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProductsPage,
});
