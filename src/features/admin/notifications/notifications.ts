import type { Order } from "@/features/admin/orders/api";
import type { MenuRow } from "@core/domain/menu/api";

/** Familles de notifications, utilisées pour filtrer le panneau. */
export type NotificationGroup = "precommandes" | "commandes" | "paiements" | "stocks";

export type NotificationKind =
  | "nouvelle_precommande"
  | "nouvelle_commande"
  | "acompte_a_verifier"
  | "paiement_echoue"
  | "plat_epuise";

export type AdminNotification = {
  id: string;
  kind: NotificationKind;
  group: NotificationGroup;
  title: string;
  detail: string;
  /** Date de l'événement (ISO). Pour un plat épuisé : le jour concerné. */
  at: string;
  /** Référence de commande à rechercher quand on clique. */
  reference?: string;
};

export const NOTIFICATION_KINDS: Record<
  NotificationKind,
  { label: string; group: NotificationGroup }
> = {
  nouvelle_precommande: { label: "Nouvelle précommande", group: "precommandes" },
  nouvelle_commande: { label: "Nouvelle commande", group: "commandes" },
  acompte_a_verifier: { label: "Acompte à vérifier", group: "paiements" },
  paiement_echoue: { label: "Paiement échoué", group: "paiements" },
  plat_epuise: { label: "Plat épuisé", group: "stocks" },
};

export const NOTIFICATION_GROUPS: { value: NotificationGroup | "all"; label: string }[] = [
  { value: "all", label: "Toutes" },
  { value: "precommandes", label: "Précommandes" },
  { value: "commandes", label: "Commandes" },
  { value: "paiements", label: "Paiements" },
  { value: "stocks", label: "Stocks" },
];

/** Fenêtre affichée : les 7 derniers jours. */
const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Notifications calculées à partir des données déjà chargées (commandes rafraîchies toutes les
 * 30 s, menu) : pas de table dédiée en base.
 */
export function buildNotifications(
  orders: Order[],
  menu: MenuRow[],
  today: string,
  now = Date.now(),
): AdminNotification[] {
  const list: AdminNotification[] = [];
  for (const order of orders) {
    if (now - new Date(order.created_at).getTime() > WINDOW_MS) continue;
    const client = `${order.first_name} ${order.last_name}`.trim();
    const kind: NotificationKind =
      order.order_type === "precommande" ? "nouvelle_precommande" : "nouvelle_commande";
    list.push({
      id: `${kind}:${order.id}`,
      kind,
      group: NOTIFICATION_KINDS[kind].group,
      title: client,
      detail: order.reference,
      at: order.created_at,
      reference: order.reference,
    });
    if (
      order.payment_status === "acompte_a_verifier" ||
      order.payment_status === "echec_paiement"
    ) {
      const payKind: NotificationKind =
        order.payment_status === "acompte_a_verifier" ? "acompte_a_verifier" : "paiement_echoue";
      list.push({
        id: `${payKind}:${order.id}`,
        kind: payKind,
        group: "paiements",
        title: client,
        detail: order.reference,
        at: order.created_at,
        reference: order.reference,
      });
    }
  }
  for (const row of menu) {
    if (row.day_date < today || !row.is_active || row.stock_left > 0) continue;
    list.push({
      id: `plat_epuise:${row.day_product_id}`,
      kind: "plat_epuise",
      group: "stocks",
      title: row.name,
      detail: "Toutes les portions prévues sont réservées",
      at: `${row.day_date}T00:00:00Z`,
    });
  }
  return list.sort((a, b) => b.at.localeCompare(a.at));
}

const SEEN_KEY = "admin-notifications-seen";

/** Identifiants déjà vus, gardés dans ce navigateur. */
export function loadSeen(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

export function saveSeen(ids: Set<string>) {
  try {
    // On ne garde que les plus récents pour ne pas grossir indéfiniment.
    localStorage.setItem(SEEN_KEY, JSON.stringify([...ids].slice(-500)));
  } catch {
    // Stockage indisponible (navigation privée) : les notifications restent simplement non lues.
  }
}

/** « à l'instant », « il y a 12 min », « 14:32 », « hier 09:10 », « 28 sept. 18:05 ». */
export function formatNotificationTime(iso: string, kind: NotificationKind, now = new Date()) {
  const date = new Date(iso);
  if (kind === "plat_epuise") {
    return new Intl.DateTimeFormat("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "UTC",
    }).format(date);
  }
  const minutes = Math.round((now.getTime() - date.getTime()) / 60000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const time = new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Dakar",
  }).format(date);
  const dayKey = (d: Date) =>
    new Intl.DateTimeFormat("fr-CA", { timeZone: "Africa/Dakar" }).format(d);
  if (dayKey(date) === dayKey(now)) return `aujourd'hui ${time}`;
  const yesterday = new Date(now.getTime() - 86400000);
  if (dayKey(date) === dayKey(yesterday)) return `hier ${time}`;
  const day = new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    timeZone: "Africa/Dakar",
  }).format(date);
  return `${day} ${time}`;
}
