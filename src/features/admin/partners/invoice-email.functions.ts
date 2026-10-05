import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@core/integrations/supabase/auth-middleware";

/** « Envoyer par email » depuis l'onglet Facturation (réservé au gérant). */
export const emailPartnerInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        partnerId: z.string().uuid(),
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("is_admin");
    if (!isAdmin) throw new Error("Réservé au gérant.");
    const { sendPartnerInvoice } = await import("./invoice-email.server");
    return sendPartnerInvoice(data.partnerId, data.from, data.to);
  });
