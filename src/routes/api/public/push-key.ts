import { createFileRoute } from "@tanstack/react-router";

/** Clé publique VAPID, nécessaire au navigateur pour s'abonner aux notifications push. */
export const Route = createFileRoute("/api/public/push-key")({
  server: {
    handlers: {
      GET: () => {
        const publicKey = process.env["VAPID_PUBLIC_KEY"];
        if (!publicKey) return Response.json({ publicKey: null }, { status: 503 });
        return Response.json({ publicKey });
      },
    },
  },
});
