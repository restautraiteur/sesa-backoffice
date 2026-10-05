# Documentation — le restaurant

Application de précommande pour un service traiteur à Dakar. Chaque dimanche, le gérant publie
le menu du lundi au vendredi. Les clients commandent sans créer de compte et paient en ligne par PayDunya.

- **Ajouter une fonctionnalité :** suivez [`ajouter-une-fonctionnalite.md`](ajouter-une-fonctionnalite.md).
- **Comprendre une fonctionnalité existante :** ouvrez sa fiche ci-dessous.
- **Fonctionnalités prévues :** voir [`nouvelles-fonctionnalites.md`](nouvelles-fonctionnalites.md).

## Fonctionnalités

### Côté client
| Fiche | Code | Page(s) |
| --- | --- | --- |
| [Accueil (vitrine)](fonctionnalites/accueil.md) | `src/features/home/` | `/` |
| [Menu de la semaine](fonctionnalites/menu-de-la-semaine.md) | `src/features/menu/` | `/` |
| [Panier](fonctionnalites/panier.md) | `src/features/cart/` | toutes |
| [Commande et confirmation](fonctionnalites/commande.md) | `src/features/checkout/` | `/commande`, `/confirmation` |
| [Abonnements](fonctionnalites/abonnements.md) | `src/features/admin/subscriptions/` | `/admin/abonnements` |
| [Paiement PayDunya](fonctionnalites/paiement.md) | `src/features/payment/` | `/api/public/paydunya-ipn` |

### Côté gérant
| Fiche | Code | Page(s) |
| --- | --- | --- |
| [Connexion gérant](fonctionnalites/connexion-gerant.md) | `src/features/auth/` | `/auth` |
| [Espace gérant : vue d'ensemble](fonctionnalites/admin.md) | `src/features/admin/` | `/admin/*` |
| [Accès et navigation](fonctionnalites/admin-acces.md) | `src/features/admin/layout/` | `/admin/*` |
| [Tableau de bord](fonctionnalites/admin-tableau-de-bord.md) | `src/features/admin/dashboard/` | `/admin` |
| [Semaines et menus](fonctionnalites/admin-semaines-et-menus.md) | `src/features/admin/menu-planning/` | `/admin/weeks` |
| [Catalogue produits](fonctionnalites/admin-produits.md) | `src/features/admin/products/` | `/admin/products` |
| [Commandes](fonctionnalites/admin-commandes.md) | `src/features/admin/orders/` | `/admin/orders` |
| [Simulation de production et des dépenses](fonctionnalites/admin-simulation.md) | `src/features/admin/simulation/` | `/admin/simulation` |

## Organisation du code

Le dépôt contient **deux applications séparées** qui partagent du code commun et la même base Supabase.

```
apps/
├── site/        site client : accueil, menu, jus, panier, commande, paiement   (http://localhost:8080)
└── admin/       espace gérant : tableau de bord, menus, catalogue, commandes,
                 bilan, simulation, connexion                                   (http://localhost:8081)
packages/
├── core/        commun : accès à la base (`@core/lib/db`), formats, requêtes du menu et des jus,
│                client Supabase, logo
└── ui/          commun : composants d'interface shadcn (`@ui/components/ui/…`)
supabase/
└── migrations/  schéma de la base (tables, sécurité, fonctions SQL), commun aux deux apps
doc/             documentation
```

Dans chaque app : `src/routes/` (une page = un fichier, URL et balises `<head>`), `src/features/`
(le code de chaque fonctionnalité), `src/components/` (composants propres à l'app).

Imports : `@/…` = l'app courante, `@core/…` = `packages/core/src`, `@ui/…` = `packages/ui/src`.

Déploiement : voir [`deploiement.md`](deploiement.md).

## Technologies
- **TanStack Start** (React 19, routage par fichiers, fonctions serveur) et **Vite**
- **Supabase** : base PostgreSQL, authentification, stockage des photos, sécurité au niveau des lignes
- **Tailwind CSS 4** et composants **shadcn/ui**
- **TanStack Query** pour charger les données
- **PayDunya** pour le paiement
- Hébergement **Vercel** : deux projets, un par application (voir [`deploiement.md`](deploiement.md)).

## Lancer le projet en local
```bash
npm install          # une seule fois, à la racine
npm run dev     # site client   → http://localhost:8080
npm run dev    # espace gérant → http://localhost:8081
```

**Nouveau client :** voir [personnaliser.md](personnaliser.md) pour tout ce qui est à remplacer.
