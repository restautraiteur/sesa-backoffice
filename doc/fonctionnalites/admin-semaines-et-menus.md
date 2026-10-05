# Semaines et menus

**Code :** `src/features/admin/menu-planning/`

Le gérant compose et publie le menu de chaque semaine.

**Route :** `/admin/weeks`

## Fonctionnement
1. **Calendrier mensuel** : on navigue de mois en mois. Chaque semaine va du lundi au dimanche.
2. **Ouvrir une semaine** : crée la semaine en **brouillon** et ses 7 jours. Le lundi au vendredi sont ouverts, le samedi et le dimanche fermés.
3. **Composer un jour** (clic sur le jour) :
   - ouvrir ou fermer la journée ;
   - régler l'heure d'ouverture et l'**heure limite de commande** ;
   - ajouter un plat : soit un **nouveau plat** (nom, description, catégorie, photo), créé aussi dans le catalogue, soit un plat **du catalogue** ;
   - pour chaque plat : **prix du jour**, **stock initial**, portions réservées, activer ou désactiver, retirer.
4. **Publier la semaine** : elle devient visible par les clients. « Dépublier » la cache à nouveau.

## Fichiers
| Fichier | Rôle |
| --- | --- |
| `api.ts` | Types `Week`, `Day` et leurs requêtes |
| `calendar.ts` | Calculs de dates (lundi de la semaine, semaines du mois…) |
| `weeks-page.tsx` | Calendrier, création et publication des semaines |
| `components/day-dialog.tsx` | Fenêtre de composition d'un jour |
| `components/add-product-form.tsx` | Ajout d'un plat (nouveau ou du catalogue) |

## Points relevés par l'audit
- 🔴 Retirer un plat d'un jour se fait **sans confirmation**, même s'il a déjà des commandes.
- 🟠 L'**heure d'ouverture** n'a aucun effet : seule l'heure limite est appliquée.
- 🟡 Prix et stock acceptent des valeurs vides (0) ou négatives. Le stock peut aussi être fixé sous le nombre de portions déjà réservées.
- 🟡 Dépublier une semaine qui a des commandes se fait sans avertissement.
