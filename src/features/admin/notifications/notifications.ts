import type { Order } from "@/features/admin/orders/api";
import type { MenuRow } from "@core/domain/menu/api";

/** Familles de notifications, utilisées pour filtrer le panneau. */
export type NotificationGroup =
  "precommandes" | "commandes" | "paiements" | "stocks" | "entreprises";

export type NotificationKind =
  | "nouvelle_precommande"
  | "nouvelle_commande"
  | "acompte_a_verifier"
  | "paiement_echoue"
  | "plat_epuise"
  | "commande_entreprise"
  | "facture_impayee"
  | "code_bloque"
  | "commandes_closes"
  | "factures_a_envoyer";

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
  commande_entreprise: { label: "Commande entreprise", group: "entreprises" },
  facture_impayee: { label: "Facture impayée", group: "entreprises" },
  code_bloque: { label: "Code employé bloqué", group: "entreprises" },
  commandes_closes: { label: "Commandes closes", group: "entreprises" },
  factures_a_envoyer: { label: "Factures à envoyer", group: "entreprises" },
};

export const NOTIFICATION_GROUPS: { value: NotificationGroup | "all"; label: string }[] = [
  { value: "all", label: "Toutes" },
  { value: "precommandes", label: "Précommandes" },
  { value: "commandes", label: "Commandes" },
  { value: "paiements", label: "Paiements" },
  { value: "stocks", label: "Stocks" },
  { value: "entreprises", label: "Entreprises" },
];

/** Données du module « Entreprises partenaires » (si activé). */
export type PartnerNotificationData = {
  partners: {
    id: string;
    name: string;
    cutoff_time: string;
    cutoff_day_offset: number;
    delivery_time: string;
  }[];
  /** Repas commandés par les entreprises (mois précédent et mois en cours). */
  lines: { partner_id: string; day_date: string; quantity: number }[];
  employees: {
    id: string;
    full_name: string;
    partner_id: string;
    pin_failures: number;
    active: boolean;
  }[];
  invoices: {
    id: string;
    partner_id: string;
    month: string;
    reference: string;
    total: number;
    status: string;
    sent_at: string;
  }[];
};

/** Une facture envoyée depuis plus de 30 jours sans être payée est signalée. */
const INVOICE_OVERDUE_MS = 30 * 24 * 60 * 60 * 1000;

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
  partnerData?: PartnerNotificationData,
): AdminNotification[] {
  const list: AdminNotification[] = [];
  const partnerName = new Map((partnerData?.partners ?? []).map((p) => [p.id, p.name]));
  for (const order of orders) {
    if (now - new Date(order.created_at).getTime() > WINDOW_MS) continue;
    if (order.partner_id) {
      list.push({
        id: `commande_entreprise:${order.id}`,
        kind: "commande_entreprise",
        group: "entreprises",
        title: order.first_name,
        detail: `${partnerName.get(order.partner_id) ?? order.last_name} · ${order.reference}`,
        at: order.created_at,
        reference: order.reference,
      });
      continue;
    }
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
  for (const invoice of partnerData?.invoices ?? []) {
    if (
      invoice.status === "payee" ||
      now - new Date(invoice.sent_at).getTime() < INVOICE_OVERDUE_MS
    )
      continue;
    list.push({
      id: `facture_impayee:${invoice.id}`,
      kind: "facture_impayee",
      group: "entreprises",
      title: partnerName.get(invoice.partner_id) ?? "Entreprise",
      detail: `${invoice.reference} envoyée il y a plus de 30 jours`,
      at: invoice.sent_at,
    });
  }
  for (const employee of partnerData?.employees ?? []) {
    if (!employee.active || employee.pin_failures < 5) continue;
    list.push({
      id: `code_bloque:${employee.id}:${employee.pin_failures}`,
      kind: "code_bloque",
      group: "entreprises",
      title: employee.full_name,
      detail: `${partnerName.get(employee.partner_id) ?? ""} · code bloqué après 5 essais`,
      at: new Date(now).toISOString(),
    });
  }
  // Récapitulatif à l'heure limite : les commandes du jour sont closes, quantités à préparer.
  for (const partner of partnerData?.partners ?? []) {
    const meals = (partnerData?.lines ?? [])
      .filter((l) => l.partner_id === partner.id && l.day_date === today)
      .reduce((s, l) => s + l.quantity, 0);
    if (meals === 0) continue;
    const deadline = new Date(`${today}T${partner.cutoff_time}Z`);
    deadline.setUTCDate(deadline.getUTCDate() - partner.cutoff_day_offset);
    if (now < deadline.getTime()) continue;
    list.push({
      id: `commandes_closes:${partner.id}:${today}`,
      kind: "commandes_closes",
      group: "entreprises",
      title: `${partner.name} : ${meals} repas aujourd'hui`,
      detail: `Commandes closes · livraison à ${partner.delivery_time.slice(0, 5).replace(":", " h ")}`,
      at: deadline.toISOString(),
    });
  }
  // Fin / début de mois : entreprises qui ont commandé ce mois-là sans facture envoyée.
  const dayOfMonth = Number(today.slice(8, 10));
  if (partnerData && (dayOfMonth >= 25 || dayOfMonth <= 5)) {
    const ref = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
    if (dayOfMonth <= 5) ref.setUTCMonth(ref.getUTCMonth() - 1);
    const month = ref.toISOString().slice(0, 7);
    const ordered = new Set(
      partnerData.lines.filter((l) => l.day_date.startsWith(month)).map((l) => l.partner_id),
    );
    const invoiced = new Set(
      partnerData.invoices.filter((i) => i.month.startsWith(month)).map((i) => i.partner_id),
    );
    const missing = [...ordered].filter((id) => !invoiced.has(id));
    if (missing.length > 0) {
      list.push({
        id: `factures_a_envoyer:${month}:${missing.length}`,
        kind: "factures_a_envoyer",
        group: "entreprises",
        title: `${missing.length} facture${missing.length > 1 ? "s" : ""} à envoyer`,
        detail: missing.map((id) => partnerName.get(id) ?? "").join(", "),
        at: new Date(now).toISOString(),
      });
    }
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
