/** Couleur de chaque statut de commande, du plus urgent (nouvelle) au terminé (livrée). */
export const ORDER_STATUS_TONES: Record<string, string> = {
  nouvelle: "bg-amber-100 text-amber-900 ring-amber-300",
  confirmee: "bg-sky-100 text-sky-900 ring-sky-300",
  en_livraison: "bg-violet-100 text-violet-900 ring-violet-300",
  livree: "bg-emerald-100 text-emerald-900 ring-emerald-300",
  annulee: "bg-rose-50 text-rose-800 ring-rose-200",
};

export const PAYMENT_STATUS_TONES: Record<string, string> = {
  non_paye: "bg-stone-100 text-stone-700 ring-stone-300",
  en_attente_paiement: "bg-amber-100 text-amber-900 ring-amber-300",
  echec_paiement: "bg-rose-100 text-rose-900 ring-rose-300",
  acompte_a_verifier: "bg-orange-100 text-orange-900 ring-orange-300",
  acompte_paye: "bg-sky-100 text-sky-900 ring-sky-300",
  a_la_livraison: "bg-amber-100 text-amber-900 ring-amber-300",
  paye: "bg-emerald-100 text-emerald-900 ring-emerald-300",
  abonnement: "bg-sky-100 text-sky-900 ring-sky-300",
};
