# Panier

**Code :** `src/features/cart/`

Garde en mémoire les produits choisis par le client jusqu'à la commande.

## Fonctionnement
- Le client n'a pas besoin de compte : le panier est stocké dans le navigateur (`localStorage`, clé `traiteur.cart.v1`). Il est donc conservé si on recharge la page.
- Un panier peut contenir des produits de **plusieurs jours**.
- Le nombre d'articles s'affiche dans le header, avec une animation à chaque ajout.
- Une barre en bas de l'écran affiche le nombre d'articles, le total et un bouton « Voir le panier ».
- Le panier est vidé au départ vers le paiement.

## Fichiers
| Fichier | Rôle |
| --- | --- |
| `cart-context.tsx` | `CartProvider` et `useCart()` : ajouter, changer la quantité, retirer, vider, total, nombre |
| `components/cart-bar.tsx` | Barre panier en bas de l'écran |
