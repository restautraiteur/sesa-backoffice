import { formatDay, formatPrice } from "@core/lib/format";
import { sendPush, type VapidKeys } from "@/features/admin/push/web-push.server";

/** Contenu reçu par le service worker (`public/sw.js`). */
export type PushMessage = {
  title: string;
  body: string;
  /** Page ouverte au clic. */
  url: string;
  /** Deux messages de même `tag` se remplacent au lieu de s'empiler. */
  tag: string;
};

export function vapidKeys(): VapidKeys | null {
  const publicKey = process.env["VAPID_PUBLIC_KEY"];
  const privateKey = process.env["VAPID_PRIVATE_KEY"];
  if (!publicKey || !privateKey) return null;
  return {
    publicKey,
    privateKey,
    subject: process.env["VAPID_SUBJECT"] ?? "mailto:contact@exemple.com",
  };
}

type SubscriptionRow = { id: string; endpoint: string; p256dh: string; auth: string };

/** Envoie `message` à tous les appareils abonnés (ou à ceux d'un gérant) et nettoie les abonnements expirés. */
export async function notifyAdmins(message: PushMessage, options: { userId?: string } = {}) {
  const vapid = vapidKeys();
  if (!vapid) throw new Error("Notifications push non configurées (clés VAPID manquantes).");
  const { supabaseAdmin } = await import("@core/integrations/supabase/client.server");
  // La table n'est pas encore dans les types générés.
  const admin = supabaseAdmin as unknown as {
    from: (table: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
  };
  let query = admin.from("push_subscriptions").select("id, endpoint, p256dh, auth");
  if (options.userId) query = query.eq("user_id", options.userId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const subscriptions = (data ?? []) as SubscriptionRow[];

  const results = await Promise.allSettled(
    subscriptions.map((s) => sendPush(s, message, vapid, { topic: message.tag.slice(0, 32) })),
  );
  const expired = subscriptions.filter((_, i) => {
    const result = results[i];
    return result?.status === "fulfilled" && result.value.expired;
  });
  if (expired.length > 0) {
    await admin
      .from("push_subscriptions")
      .delete()
      .in(
        "id",
        expired.map((s) => s.id),
      );
  }
  return {
    sent: results.filter((r) => r.status === "fulfilled" && r.value.ok).length,
    total: subscriptions.length,
    removed: expired.length,
  };
}

/* -------------------------------------------------------------------------- */
/* Messages déclenchés par les webhooks de base de données                    */
/* -------------------------------------------------------------------------- */

type OrderRecord = {
  id: string;
  reference: string;
  first_name: string;
  last_name: string;
  total: number;
  order_type: string;
  payment_status: string;
};

type DayProductRecord = {
  id: string;
  day_id: string;
  product_id: string;
  stock_initial: number;
  stock_reserved: number;
  is_active: boolean;
};

export type WebhookPayload = {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  record: Record<string, unknown> | null;
  old_record: Record<string, unknown> | null;
};

const ordersUrl = (reference: string) => `/admin/orders?q=${encodeURIComponent(reference)}`;

/** Traduit un changement en base en notification, ou `null` s'il n'y a rien à signaler. */
export async function messageForChange(payload: WebhookPayload): Promise<PushMessage | null> {
  if (payload.table === "orders" && payload.record) {
    const order = payload.record as unknown as OrderRecord;
    const client = `${order.first_name} ${order.last_name}`.trim();
    if (payload.type === "INSERT") {
      const preorder = order.order_type === "precommande";
      return {
        title: preorder ? "Nouvelle précommande" : "Nouvelle commande",
        body: `${client} · ${formatPrice(order.total)} · ${order.reference}`,
        url: ordersUrl(order.reference),
        tag: `order-${order.id}`,
      };
    }
    const before = payload.old_record as unknown as OrderRecord | null;
    if (payload.type === "UPDATE" && before?.payment_status !== order.payment_status) {
      if (order.payment_status === "acompte_a_verifier") {
        return {
          title: "Acompte à vérifier",
          body: `${client} a déclaré son acompte · ${order.reference}`,
          url: ordersUrl(order.reference),
          tag: `payment-${order.id}`,
        };
      }
      if (order.payment_status === "echec_paiement") {
        return {
          title: "Paiement échoué",
          body: `${client} · ${order.reference}`,
          url: ordersUrl(order.reference),
          tag: `payment-${order.id}`,
        };
      }
    }
    return null;
  }

  if (payload.table === "day_products" && payload.type === "UPDATE" && payload.record) {
    const row = payload.record as unknown as DayProductRecord;
    const before = payload.old_record as unknown as DayProductRecord | null;
    const soldOut = row.is_active && row.stock_reserved >= row.stock_initial;
    const wasSoldOut = before ? before.stock_reserved >= before.stock_initial : false;
    if (!soldOut || wasSoldOut) return null;
    const { supabaseAdmin } = await import("@core/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as {
      from: (table: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
    };
    const [{ data: product }, { data: day }] = await Promise.all([
      admin.from("products").select("name").eq("id", row.product_id).maybeSingle(),
      admin.from("days").select("date").eq("id", row.day_id).maybeSingle(),
    ]);
    const name = (product as { name?: string } | null)?.name ?? "Un plat";
    const date = (day as { date?: string } | null)?.date;
    return {
      title: `Plat épuisé : ${name}`,
      body: `Toutes les portions${date ? ` de ${formatDay(date).toLowerCase()}` : ""} sont réservées. Ajoutez-en si la cuisine peut en préparer plus.`,
      url: "/admin/weeks",
      tag: `soldout-${row.id}`,
    };
  }
  return null;
}
