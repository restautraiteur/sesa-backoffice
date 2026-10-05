# Accueil (vitrine)

**Code :** `src/features/home/`

Page d'accueil publique du traiteur. Elle présente la maison et donne envie de commander.

**Route :** `/`

## Ce que voit le client
1. **Bannière** : grande photo des plats et accroche « Le goût de la maison, préparé chaque jour ».
2. **Menu de la semaine** : voir [`menu/`](menu-de-la-semaine.md).
3. **Aperçu de nos plats** : photos des plats sénégalais qui défilent en continu sur 2 rangées.
4. **Un voyage culinaire** : texte de présentation et vidéo de la cheffe en cuisine.
5. **Notre cheffe** : portrait et parcours du chef (exemple à remplacer), suivi d'un séparateur avec une toque entre deux filets dorés (`components/chef-hat-divider.tsx`).
6. **Service traiteur sur devis** : mariages, baptêmes, anniversaires, entreprises, avec un bouton de devis WhatsApp (78 186 72 72).
7. **Ils nous font confiance** : logos des partenaires qui défilent (Free, Oxium Sénégal, Yas, Banque Mondiale, Unicn Africa). Pour en ajouter un : déposer le logo dans `src/assets/partenaires/` et l'ajouter à `TRUSTED_COMPANIES`.
8. **Témoignages** : avis clients en carrousel, avec flèches et barre de progression.

## Fichiers
| Fichier | Rôle |
| --- | --- |
| `home-page.tsx` | Assemble toutes les sections |
| `components/hero.tsx` | Bannière |
| `components/gallery-marquee.tsx` | Galerie défilante |
| `components/culinary-journey-section.tsx` | Voyage culinaire et vidéo |
| `components/chef-section.tsx` | Notre cheffe |
| `components/catering-section.tsx` | Service traiteur sur devis |
| `components/trusted-companies-section.tsx` | Entreprises clientes |
| `components/testimonials-section.tsx` | Témoignages |

## À faire avant la mise en ligne
- ⚠️ Les **témoignages** (`TESTIMONIALS`) sont des exemples : remplacez-les par de vrais avis clients.
