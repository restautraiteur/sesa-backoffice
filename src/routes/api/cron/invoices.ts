import { createFileRoute } from "@tanstack/react-router";

/**
 * Tâche planifiée Vercel (vercel.json → crons), chaque matin : envoie les factures des entreprises
 * dont c'est le jour d'envoi. Vercel ajoute l'en-tête « Authorization: Bearer CRON_SECRET ».
 */
export const Route = createFileRoute("/api/cron/invoices")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const secret = process.env["CRON_SECRET"];
        if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
          return new Response("Unauthorized", { status: 401 });
        }
        const { runAutomaticInvoices } =
          await import("@/features/admin/partners/invoice-email.server");
        return Response.json(await runAutomaticInvoices());
      },
    },
  },
});
