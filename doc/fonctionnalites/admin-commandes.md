# Commandes

**Code :** `src/features/admin/orders/`

Suivi des commandes, de la réception à la livraison.

**Route :** `/admin/orders`

## Fonctionnement
- **Recherche** par référence, nom ou téléphone. **Filtres** par statut et par jour de consommation.
- **Statut de commande** : Nouvelle → Confirmée → En préparation → Prête → En livraison → Livrée (ou Annulée).
- **Statut de paiement** : Non payé, Paiement en attente, Paiement échoué, Acompte à vérifier, Acompte payé, Payé.
- Clic sur une ligne : adresse de livraison, repère, instructions, acompte et détail des produits par jour.
- **Impressions** : liste des commandes, **étiquettes** à coller sur les plats (une par client et par jour).
- **Exports** : CSV et Excel des commandes filtrées.

## Fichiers
| Fichier | Rôle |
| --- | --- |
| `api.ts` | Types `Order`, `OrderItem` et leurs requêtes |
| `orders-page.tsx` | Tableau, filtres, changement de statut |
| `print.ts` | Impression des commandes, étiquettes et liste de production |
| `export-orders.ts` | Exports CSV et Excel |

## Points relevés par l'audit
- 🔴 **Faille de sécurité** dans `print.ts` : les noms et adresses des clients sont insérés sans filtrage dans la fenêtre d'impression. Un faux client peut y glisser du code qui vole la session du gérant.
- 🔴 **Annuler une commande ne remet pas le stock** en vente.
- 🟠 Les fichiers exportés s'appellent `….csv.csv` / `….xls.xls`. Une formule Excel glissée dans un nom de client s'exécute à l'ouverture du fichier.
- 🟠 Le statut de paiement se change d'un clic, sans confirmation ni historique.
- 🟠 Aucune pagination : au-delà de 1 000 lignes, les données sont tronquées sans prévenir.
- 🟡 Aucune alerte à l'arrivée d'une nouvelle commande. Le tableau est peu lisible sur téléphone.
- 🟡 Les données clients sont conservées sans limite de durée (loi sénégalaise sur les données personnelles).
