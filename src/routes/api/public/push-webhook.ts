import { createFileRoute } from "@tanstack/react-router";

/**
 * Appelé par les « Database Webhooks » Supabase (tables `orders` et `day_products`).
 * Protégé par l'en-tête `x-webhook-secret`, égal au secret PUSH_WEBHOOK_SECRET.
 */
export const Route = createFileRoute("/api/public/push-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["PUSH_WEBHOOK_SECRET"];
        if (!secret || request.headers.get("x-webhook-secret") !== secret) {
          return new Response("Unauthorized", { status: 401 });
        }
        const payload = await request.json().catch(() => null);
        if (!payload || typeof payload !== "object" || !("table" in payload)) {
          return new Response("Bad request", { status: 400 });
        }
        const { messageForChange, notifyAdmins } =
          await import("@/features/admin/push/push.server");
        const message = await messageForChange(payload);
        if (!message) return Response.json({ skipped: true });
        const result = await notifyAdmins(message);
        return Response.json(result);
      },
    },
  },
});
