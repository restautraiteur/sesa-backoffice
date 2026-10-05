import { createFileRoute } from "@tanstack/react-router";

import { SubscriptionsPage } from "@/features/admin/subscriptions/subscriptions-page";

export const Route = createFileRoute("/admin/abonnements")({
  head: () => ({
    meta: [{ title: "Abonnements — Espace gérant" }, { name: "robots", content: "noindex" }],
  }),
  component: SubscriptionsPage,
});
