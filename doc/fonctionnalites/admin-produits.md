# Catalogue produits

**Code :** `src/features/admin/products/`

Liste des plats et jus réutilisables d'une semaine à l'autre.

**Route :** `/admin/products`

## Fonctionnement
- Tableau des produits : photo, nom, description, catégorie (plat ou jus), prix de base, actif ou non.
- Créer ou modifier un produit dans une fenêtre. La photo s'importe depuis l'ordinateur (stockage Supabase, dossier `plats`) ou se renseigne par un lien.
- Un produit **inactif** n'est plus commandable, quel que soit le jour.
- Le prix de base sert de prix proposé quand on ajoute le produit à un jour.

## Fichiers
| Fichier | Rôle |
| --- | --- |
| `api.ts` | Type `Product` et `productsQuery` |
| `products-page.tsx` | Tableau et formulaire |
| `upload-photo.ts` | Import d'une photo vers le stockage Supabase |

## Points relevés par l'audit
- 🔴 **Supprimer** un produit se fait sans confirmation et le retire de **tous les menus** (suppression en cascade). Le message d'erreur laisse croire à tort que c'est bloqué.
- 🟡 Les photos importées ne sont limitées ni en taille ni en type.
