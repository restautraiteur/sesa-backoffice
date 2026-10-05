export const WEEKDAYS = [
  "Dimanche",
  "Lundi",
  "Mardi",
  "Mercredi",
  "Jeudi",
  "Vendredi",
  "Samedi",
] as const;

export function formatPrice(value: number) {
  return `${new Intl.NumberFormat("fr-FR").format(value)} FCFA`;
}

export function parseDate(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
}

export function weekdayLabel(dateStr: string) {
  return WEEKDAYS[parseDate(dateStr).getUTCDay()] ?? "";
}

export function formatDay(dateStr: string) {
  const date = parseDate(dateStr);
  return `${weekdayLabel(dateStr)} ${date.getUTCDate()} ${
    [
      "janvier",
      "février",
      "mars",
      "avril",
      "mai",
      "juin",
      "juillet",
      "août",
      "septembre",
      "octobre",
      "novembre",
      "décembre",
    ][date.getUTCMonth()]
  }`;
}

export function formatDayShort(dateStr: string) {
  const date = parseDate(dateStr);
  return `${weekdayLabel(dateStr)} ${String(date.getUTCDate()).padStart(2, "0")}/${String(
    date.getUTCMonth() + 1,
  ).padStart(2, "0")}`;
}

export function formatTime(time: string | null | undefined) {
  if (!time) return "—";
  const [h, m] = time.split(":");
  return `${h}h${m}`;
}

export function todayISO() {
  return new Intl.DateTimeFormat("fr-CA", {
    timeZone: "Africa/Dakar",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/**
 * Toute la cuisine est préparée en même temps : une commande passe directement
 * de « confirmée » à « en livraison ». (Plus de statuts « en préparation » ni « prête ».)
 */
export const ORDER_STATUSES = [
  "nouvelle",
  "confirmee",
  "en_livraison",
  "livree",
  "annulee",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_LABELS: Record<string, string> = {
  nouvelle: "Nouvelle",
  confirmee: "Confirmée",
  en_livraison: "En livraison",
  livree: "Livrée",
  annulee: "Annulée",
};

export const STATE_LABELS: Record<string, string> = {
  disponible: "Disponible",
  epuise: "Épuisé",
  ferme: "Commandes fermées",
  desactive: "Indisponible",
  jour_ferme: "Journée fermée",
};

export const PAYMENT_STATUSES = [
  "non_paye",
  "en_attente_paiement",
  "echec_paiement",
  "acompte_a_verifier",
  "acompte_paye",
  "a_la_livraison",
  "paye",
  "abonnement",
] as const;

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  non_paye: "Non payé",
  en_attente_paiement: "Paiement en attente",
  echec_paiement: "Paiement échoué",
  acompte_a_verifier: "Acompte à vérifier",
  acompte_paye: "Acompte payé · solde à recevoir",
  a_la_livraison: "À payer à la livraison",
  paye: "Payé",
  abonnement: "Abonnement",
};

export const CATEGORY_LABELS: Record<string, string> = {
  plat: "Plat",
  jus: "Jus",
};
