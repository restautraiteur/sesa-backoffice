# Commande et confirmation

**Code :** `src/features/checkout/`

Le client vérifie son panier, donne ses coordonnées de livraison et paie.

**Routes :** `/commande`, `/confirmation`

## Étapes
1. **Récapitulatif** : produits regroupés par jour, avec quantités modifiables. Les produits devenus indisponibles sont signalés.
2. **Coordonnées** : prénom, nom, téléphone et adresse (obligatoires). Complément d'adresse, point de repère et instructions (facultatifs).
3. **Conditions** : le client doit accepter que la précommande soit **non remboursable**.
4. **Validation** : la fonction SQL `place_order` revérifie tout côté serveur (semaine publiée, produit actif, jour ouvert, heure limite, stock), réserve le stock et crée la commande avec une référence `CMD-AAAAMMJJ-NNN`.
5. **Paiement** : le client est redirigé vers PayDunya (voir [`payment/`](paiement.md)).
6. **Confirmation** : la page affiche la référence, le détail et le statut du paiement.

## Règles métier
- **Commande immédiate** (tous les produits sont pour aujourd'hui) : le client paie le **total**.
- **Précommande** (au moins un produit pour un jour futur) : le client paie un **acompte de 1 500 FCFA**.
- Maximum 200 portions par produit et par commande.
- Si le paiement échoue, un nouvel essai réutilise la commande déjà créée, sans en créer une deuxième.

## Fichiers
| Fichier | Rôle |
| --- | --- |
| `api.ts` | `placeOrder()`, `DEPOSIT_AMOUNT` (1 500), `PAYMENT_NUMBER` |
| `checkout-page.tsx` | Page panier et formulaire de livraison |
| `confirmation-page.tsx` | Page de confirmation |

## Points relevés par l'audit
- Deux commandes passées au même moment peuvent recevoir la même référence, et l'une des deux est alors refusée.
