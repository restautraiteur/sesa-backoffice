# Menu de la semaine

**Code :** `src/features/menu/`

Affiche les plats et jus disponibles, jour par jour, et permet de les ajouter au panier.

**Route :** `/` (section de la page d'accueil)

## Fonctionnement
- Le gérant publie le menu de la semaine (du lundi au vendredi), généralement le dimanche.
- Seules les **semaines publiées** et les **jours à venir** sont affichés.
- Le client choisit un jour dans les onglets. Le jour actuel est marqué d'un point.
- Les plats et les jus de ce jour s'affichent dans deux rangées qui défilent horizontalement.
- Le menu se recharge automatiquement **toutes les 60 secondes** pour garder les stocks à jour.

## États d'un produit
Calculés par la vue SQL `menu_view` :

| État | Signification | Commande possible |
| --- | --- | --- |
| `disponible` | En stock, avant l'heure limite | Oui |
| `epuise` | Stock épuisé | Non |
| `ferme` | Heure limite dépassée (ou jour passé) | Non |
| `desactive` | Produit désactivé par le gérant | Non |
| `jour_ferme` | Journée fermée | Non |

## Carte produit
- Photo, heure limite de commande, nombre de portions restantes.
- La description du plat s'affiche au survol.
- Le bouton panier ajoute le plat avec une animation, puis devient un sélecteur − / +.
- On ne peut pas commander plus que le stock restant.
- Le libellé est « Ajouter au panier » pour le jour même et « Précommander » pour un jour futur.

## Fichiers
| Fichier | Rôle |
| --- | --- |
| `api.ts` | Type `MenuRow`, requêtes `publicMenuQuery` (client) et `adminMenuQuery` (gérant) |
| `components/weekly-menu.tsx` | Titre, onglets des jours, sections plats et jus |
| `components/product-section.tsx` | Rangée défilante avec flèches |
| `components/product-card.tsx` | Carte produit et animations panier |
