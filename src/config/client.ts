/**
 * Configuration propre au client — À RENSEIGNER pour chaque restaurant. Les fonctionnalités génériques (abonnements…) lisent ces valeurs
 * au lieu d'écrire le nom du restaurant en dur : c'est ce fichier qui change d'un client à l'autre.
 */
export const CLIENT = {
  /** Nom affiché dans les messages envoyés aux clients. */
  name: "Mon Restaurant",
  /** Module « Entreprises partenaires » (employés qui commandent, facturation mensuelle à l'entreprise). */
  partners: false,
} as const;
