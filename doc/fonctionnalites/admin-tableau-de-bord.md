# Tableau de bord

**Code :** `src/features/admin/dashboard/`

Vue de production pour préparer la journée.

**Route :** `/admin`

## Fonctionnement
- Choix du jour (aujourd'hui par défaut).
- **Indicateurs** : nombre de commandes du jour, repas à préparer, jus à préparer, chiffre d'affaires.
- **Liste de production** : quantité totale à préparer par produit, imprimable.
- **Stocks faibles** : produits des jours à venir qui ont 3 portions ou moins.
- Les commandes annulées ne sont pas comptées.

## Fichiers
| Fichier | Rôle |
| --- | --- |
| `dashboard-page.tsx` | Indicateurs, liste de production, stocks faibles |

## Points relevés par l'audit
- 🟠 Le chiffre d'affaires compte aussi les commandes **non payées**.
- 🟠 Au-delà de 1 000 lignes de commande, les données sont tronquées sans prévenir (aucune pagination).
