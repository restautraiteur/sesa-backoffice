# Espace gérant

**Code :** `src/features/admin/`

Back-office du traiteur, réservé à l'administrateur.

| Dossier | Fonctionnalité | Route |
| --- | --- | --- |
| [`layout/`](admin-acces.md) | Contrôle d'accès et navigation | `/admin/*` |
| [`dashboard/`](admin-tableau-de-bord.md) | Tableau de bord de production | `/admin` |
| [`menu-planning/`](admin-semaines-et-menus.md) | Calendrier des semaines et menus du jour | `/admin/weeks` |
| [`products/`](admin-produits.md) | Catalogue des plats et jus | `/admin/products` |
| [`orders/`](admin-commandes.md) | Suivi des commandes, impressions, exports | `/admin/orders` |

## Sécurité
Toutes les tables sont protégées par la **sécurité au niveau des lignes** de Supabase : seul un compte qui a le rôle `admin` (table `user_roles`) peut lire les commandes ou modifier les menus. Le contrôle fait par l'interface ne sert qu'à l'affichage.
