# Personnaliser le modèle pour un nouveau client

Après `gh repo create restautraiteur/<client>-site --private --template restautraiteur/template-site`
(et idem pour `<client>-backoffice`), remplacer ce qui suit. La procédure complète (Supabase, Vercel, compte
gérant) est dans le skill `restau-nouveau-client`.

## Identité (obligatoire)
| À changer | Fichier |
|---|---|
| Nom, nom complet, WhatsApp, ville, abonnements activés ou non | `src/config/client.ts` (site) et `src/config/client.ts` (back-office) |
| Logo (le modèle affiche un rond « LOGO ») | `src/core/assets/logo.png` (dans les deux dépôts) |
| Couleurs | variables du thème dans `src/styles.css` (`--primary`, `--accent`, `--sidebar`…) |
| Nom de l'application gérant et des notifications | `public/admin.webmanifest`, `public/sw.js` (back-office) |
| Nom du paquet | `package.json` |

## Contenus d'exemple (à remplacer avant la mise en ligne)
Le modèle contient des **exemples**, signalés par un commentaire « EXEMPLE À REMPLACER » :
- **Chiffres clés** du haut de page (`src/features/home/components/hero-showcase.tsx`) : uniquement des
  chiffres réels fournis par le restaurant.
- **Chef** (`chef-section.tsx`) : photo, nom, parcours.
- **Photo de cuisine** du voyage culinaire (`culinary-journey-section.tsx`) : photo ou vidéo du restaurant.
- **Témoignages** (`testimonials-section.tsx`) : vrais avis de clients, avec leur accord.
- **Entreprises partenaires** (`trusted-companies-section.tsx`) : vrais partenaires avec leur accord, sinon
  retirer la section de `src/features/home/home-page.tsx`.
- **Photos de plats** (`src/assets/`) : ce sont des photos d'exemple ; les remplacer par celles du
  restaurant (voir le skill `restau-images` pour les détourer et les compresser).

Ne jamais présenter comme réels des avis, des chiffres ou des partenaires inventés.

## Données
Les formules d'abonnement de départ : `supabase/seeds/abonnements.sql` (back-office), prix à adapter.
Le gérant saisit ensuite plats, menus et jus depuis son espace.
