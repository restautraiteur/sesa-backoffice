import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@core/integrations/supabase/auth-middleware";

/** Envoie une notification d'essai aux appareils du gérant connecté. */
export const sendTestPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("is_admin");
    if (!isAdmin) throw new Error("Réservé au gérant.");
    const { notifyAdmins } = await import("@/features/admin/push/push.server");
    return notifyAdmins(
      {
        title: "Notifications activées",
        body: "Vous recevrez ici les nouvelles commandes, précommandes, paiements et plats épuisés.",
        url: "/admin",
        tag: "test",
      },
      { userId: context.userId },
    );
  });
