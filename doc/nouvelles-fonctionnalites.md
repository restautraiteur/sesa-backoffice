# Nouvelles fonctionnalités

Fonctionnalités demandées, pas encore développées. Chaque partie liste l'objectif, le périmètre
proposé et les questions à trancher avant de commencer.

| Fonctionnalité | Statut |
| --- | --- |
| [Caisse & dépenses (avec TPE)](#1-caisse--dépenses-avec-tpe) | À faire, **priorité haute** (restaurateurs) |
| [Simulation de production et des dépenses](#2-simulation-de-production-et-des-dépenses) | Développée et en ligne |
| [RH : pointage des employés et paie](#3-rh--pointage-des-employés-et-paie) | À faire, questions en attente |
| [Plateforme multi-clients : séparation site et back-office](#4-plateforme-multi-clients--séparation-site-et-back-office) | Étape 1 faite (séparation site / admin, branche `monorepo`) · cibles : **restaurateurs d'abord** |
| [Autres points en suspens](#5-autres-points-en-suspens) | À faire |

---

## 1. Caisse & dépenses (avec TPE)

**Objectif :** que le propriétaire ait une trace de **toutes les ventes et toutes les dépenses**.

**Priorité haute** : les futurs clients visés (fast-foods, restaurateurs, vendeurs de repas) ont
tous besoin d'une caisse avec TPE, cœur de leur activité (voir partie 4).

### Comment fonctionne une caisse avec TPE

```
1. Vente      La caissière choisit les produits dans la caisse → total : 6 500 F
2. Paiement   Le client choisit : Espèces · Carte (TPE) · Wave · Orange Money
3. Carte      Le montant est saisi sur le TPE → le client paie → reçu du TPE
4. Trace      La caisse enregistre : produits, montant, moyen de paiement, heure, vendeur
5. Le soir    Clôture de caisse : total par moyen de paiement, comparé à l'argent réel
```

| Mode TPE | Fonctionnement | Avantage | Inconvénient |
| --- | --- | --- | --- |
| **Autonome** (recommandé pour commencer) | On tape le montant sur le TPE puis on note « payé par carte » + n° de reçu dans la caisse | Fonctionne avec n'importe quel TPE, aucun développement | Saisie en double |
| **Intégré** | La caisse envoie le montant au TPE automatiquement | Aucune saisie en double | TPE et fournisseur avec API, contrat, intégration technique |

### Périmètre proposé (module « Caisse & Dépenses » de l'espace gérant)

1. **Vente comptoir** : on choisit les plats et jus du jour, le moyen de paiement (espèces, carte TPE
   + n° de reçu, Wave, Orange Money), puis on imprime un ticket. Le stock baisse comme pour une
   commande en ligne.
2. **Journal unique des ventes** : en ligne et comptoir, filtrable par jour, moyen de paiement et vendeur.
3. **Dépenses** : catégorie (ingrédients, gaz, emballages, transport, salaires…), montant, moyen
   de paiement, photo du reçu.
4. **Clôture de caisse chaque soir** : fond de caisse, espèces comptées et attendues, écart affiché,
   totaux carte et Wave à rapprocher des relevés. Journée verrouillée une fois clôturée.
5. **Traçabilité** : chaque opération horodatée avec son auteur. Rien ne se supprime : une erreur
   s'annule avec un motif, et l'annulation reste visible.
6. **Rapports** : chiffre d'affaires, dépenses et bénéfice par jour, semaine et mois, avec export
   Excel pour le comptable.

### Déjà en place

- Les ventes en ligne sont enregistrées (commandes + paiement PayDunya).
- La page « Bilan » donne le chiffre d'affaires de la semaine et les plats les plus vendus.
- La table `purchases` (achats) existe en base, sans écran.

### Questions à trancher

- [x] ~~Ventes sur place ou au comptoir~~ : oui pour les fast-foods et les restaurants (cibles). À confirmer pour le restaurant.
- [ ] Avez-vous déjà un **TPE** ? Si oui, de quelle banque ou de quel fournisseur ?
- [ ] **Qui encaisse** : le gérant seul ou plusieurs employés ? S'il y a plusieurs employés, il faut un compte par personne.
- [ ] Le **propriétaire et le gérant** sont-ils la même personne ? Sinon, un accès « lecture seule » aux rapports pour le propriétaire.

---

## 2. Simulation de production et des dépenses

**Objectif :** connaître la **somme à recevoir**, les **dépenses** et le **bénéfice** d'un jour ou
d'une semaine, et la liste de courses, à partir des cuissons réelles précédentes.

Modèle validé :
- ingrédients avec **plusieurs formats d'achat** (boîte 300 g, 500 g, 1 kg…) ;
- **journal de production** rempli après chaque cuisson (ce qui a été utilisé, plats obtenus) ;
- quantités par plat calculées sur les **3 dernières cuissons** ;
- prévisions avec liste de courses dans le format habituel (arrondi au-dessus), somme à recevoir
  (assurée, déjà payée, si tout est vendu), dépenses et bénéfice, prévus et réels.

En ligne (page « Simulation » de l'espace gérant). Détail et points prévus
pour plus tard : [fiche de la fonctionnalité](fonctionnalites/admin-simulation.md).

---

## 3. RH : pointage des employés et paie

**Objectif :** que le gérant sache qui est venu, à quelle heure, et que le salaire tienne compte des
absences et des retards, avec une **fiche** qui explique chaque montant à l'employé.

**Origine du besoin :** chez un autre traiteur, des employés ne venaient pas certains jours mais
touchaient leur salaire complet.

### Périmètre proposé

1. **Employés** : le gérant les ajoute (nom, téléphone, poste, salaire mensuel ou journalier, jours
   de travail, code PIN personnel pour pointer).
2. **Horaires** par employé ou par poste :
   - **plage d'arrivée** (ex. pointer entre 7 h 00 et 7 h 30) et **heure limite** au-delà de
     laquelle c'est un retard ;
   - **plage de départ** (ex. entre 15 h 00 et 15 h 30), avant laquelle c'est un départ anticipé ;
   - une **tolérance** (ex. 10 minutes).
3. **Pointage journalier** : l'employé pointe son arrivée et son départ. L'app enregistre l'heure et
   classe la journée : présent, en retard, départ anticipé, absent (aucun pointage).
4. **Absences justifiées** : le gérant peut marquer une absence comme justifiée (maladie, congé,
   permission), avec un justificatif. Elle n'est alors pas retenue sur le salaire.
5. **Règles de retenue** paramétrables :
   - absence non justifiée : retenue d'une journée de salaire ;
   - retards : par exemple une retenue au-delà de X retards dans le mois, ou au prorata des minutes ;
   - départ anticipé : même principe.
6. **Fiche de paie explicative** par employé et par mois : salaire de base, jours travaillés,
   absences (justifiées ou non), retards, détail de chaque retenue, **net à percevoir**.
   Imprimable ou en PDF, à remettre à l'employé.
7. **Tableau du gérant** : présents du jour, retards, absents, et récapitulatif du mois.

### Questions à trancher

- [ ] **Comment l'employé pointe-t-il ?** Sur une tablette fixe à l'entrée avec son code PIN, sur
  son propre téléphone, par QR code affiché dans la cuisine ? Faut-il vérifier qu'il est bien sur
  place (géolocalisation, photo au pointage) pour éviter qu'un collègue pointe à sa place ?
- [ ] **Les règles exactes de retenue** : montant d'une journée (salaire ÷ 30 ou ÷ jours travaillés),
  nombre de retards tolérés, retenue à la minute ou forfaitaire ?
- [ ] **Les horaires** sont-ils les mêmes pour tous, ou différents par poste (cuisine, livraison) ?
- [ ] **Les heures supplémentaires** doivent-elles être comptées et payées ?
- [ ] **Qui valide la paie** avant de remettre les fiches : le gérant, le propriétaire ?
- [ ] **Cadre légal** : les retenues doivent respecter le Code du travail sénégalais et le contrat de
  chaque employé (une absence non justifiée peut être retenue, mais les sanctions pour retard sont
  encadrées). À valider avec un comptable ou un conseiller avant de les appliquer.
- [ ] **Données personnelles** : les pointages et la paie sont des données sensibles, accessibles au
  seul gérant ou propriétaire.

---

## 4. Plateforme multi-clients : séparation site et back-office

**Objectif :** proposer l'app à de **nouveaux gros clients** (d'autres traiteurs). Chaque client a son
**site client** et son **espace gérant**, **séparés** : l'espace gérant ne doit plus faire partie du
site client.

### Est-ce faisable ? Oui.

Le code est déjà rangé par fonctionnalité (`src/features/`), ce qui facilite la séparation. Le point
clé : **séparer la logique métier (commun à tous) de la présentation (propre à chaque client)**.

**Le socle commun, gardé pour tous les clients :**
authentification, espace gérant, menus de la semaine, catalogue et prix, jus et formats, panier,
commande, paiement, stocks, commandes, tableau de bord, bilan, simulation.

**Ce qui change d'un client à l'autre :** le design du site, les sections, les textes et photos,
les couleurs, certains modules ou règles propres au client.

### Les 4 niveaux de personnalisation

| Niveau | Exemples | Qui le fait | Code ? |
| --- | --- | --- | --- |
| 1. Configuration | Nom, logo, WhatsApp, acompte, moyens de paiement, modules activés (jus, simulation, caisse, RH…) | Le développeur, fichier par client | Non |
| 2. Thème | Couleurs, polices, arrondis, style des cartes (variables CSS) | Le développeur | Non |
| 3. Contenu modifiable depuis l'admin | Textes, photos, choix et ordre des sections de l'accueil, témoignages, partenaires | **Le gérant lui-même** | Non |
| 4. Code sur mesure | Section unique, module admin spécifique, parcours différent | Le développeur, dans le dossier du client | Oui, isolé |

### Organisation proposée (un dépôt, plusieurs applications)

```
plateforme/
├── packages/
│   ├── core/        données, types, règles métier (commandes, stock, paiement, menus)
│   ├── ui/          composants d'interface adaptables au thème
│   ├── site-kit/    sections de site réutilisables (bannière, menu, jus, best-seller, témoignages…)
│   └── admin-kit/   modules gérant (tableau de bord, menus, catalogue, commandes, bilan, simulation…)
├── supabase/        migrations communes
└── clients/
    ├── <client>/
    │   ├── config.ts   nom, contacts, modules activés, acompte…
    │   ├── theme.css   couleurs, polices
    │   ├── site/       sections choisies + sections sur mesure (toque, fonio, cheffe…)
    │   ├── admin/      modules choisis + modules sur mesure
    │   └── migrations/ données propres à ce client (si besoin)
    └── client-b/ …
```

Chaque client a **sa base Supabase**, **son site** et **son espace gérant**, déployés séparément
(ex. `traiteur-b.sn` et `admin.traiteur-b.sn`). Une correction dans le socle profite à tous ; les
personnalisations d'un client restent dans son dossier.

### Et si un client veut un site complètement différent de le restaurant ?

Le site de le restaurant est très personnalisé. Pour un client qui veut un tout autre design, deux cas :

1. **Design proche, contenu différent** : on réutilise les sections du `site-kit` avec son thème, ses
   textes et ses photos. Rapide.
2. **Design entièrement différent** : on crée un nouveau site dans `clients/client-b/site/` avec ses
   propres pages et composants, mais qui **réutilise toute la logique** du socle : lecture du menu,
   panier, commande, paiement, stocks. Seule la présentation est refaite. C'est le principe dit
   « headless » : le moteur est commun, la carrosserie change.

Dans les deux cas, l'espace gérant reste celui du socle, avec ses modules activés ou non, et
éventuellement un thème et des modules propres au client.

### Hébergement

| | Une installation par client (recommandé au début) | Plateforme partagée (plus tard) |
| --- | --- | --- |
| Principe | Une base Supabase et deux déploiements par client | Un seul back-office et une seule base, données séparées par client |
| Isolation | Totale | Par règles de sécurité, à concevoir avec soin |
| Effort | Moyen | Élevé (toutes les tables et règles à revoir, inscription, facturation) |
| Adapté pour | 2 à 10 clients | Des dizaines de clients, offre par abonnement |

### Étapes proposées

1. ✅ **Fait (branche `monorepo`)** : `apps/site` et `apps/admin` séparés, code commun dans
   `packages/core` et `packages/ui`. Reste à configurer les deux projets Vercel (voir `doc/deploiement.md`).
2. Sortir la configuration et le thème de le restaurant du code.
3. Édition du contenu du site depuis l'admin (niveau 3).
4. Script d'installation d'un nouveau client (base, migrations, déploiements).
5. Plus tard, si le nombre de clients le justifie : plateforme partagée et abonnement.

### Décisions prises

- **Personnalisation** : le **design et les fonctionnalités** sont personnalisés pour chaque client.
  Le niveau 4 (code sur mesure) sera fréquent : le socle doit être pensé en **modules** activables
  et remplaçables, et la logique métier strictement séparée de la présentation.
- **Cibles** : les **fast-foods**, les **restaurateurs** et plus largement les **vendeurs de repas**
  (traiteurs comme le restaurant). Tous ont besoin d'une **caisse avec TPE** (voir partie 1).
- **Priorité : les restaurateurs d'abord.** Le premier mode à construire après l'existant est donc
  le **service à table** (plan de salle, commandes des serveurs, tickets cuisine, addition et
  caisse + TPE). Les fast-foods viendront ensuite.
- **Hébergement** : **Vercel** pour les sites et les espaces gérant (avec une base Supabase par
  client).

### Considération clé : chaque type de client fonctionne différemment

| | Traiteur / vente de repas (le restaurant) | Fast-food | Restaurant |
| --- | --- | --- | --- |
| Offre | Menu **de la semaine** ou du jour | **Carte permanente** | **Carte** + plat du jour |
| Commande | **Précommande** en ligne, livraison | **Comptoir / à emporter**, immédiate | **À table** (serveur), sur place, parfois à emporter |
| Encaissement | En ligne (PayDunya) | **Caisse + TPE** à la commande | **Caisse + TPE** en fin de repas (addition) |
| Cuisine | Production planifiée (simulation) | **Tickets cuisine en temps réel** | Tickets cuisine **par table**, envoi par plat (entrée, plat, dessert) |
| Spécifique | Acompte, créneaux de livraison | Formules menu, suppléments | **Plan de salle et tables**, addition partagée, pourboire |

Le socle doit donc proposer **plusieurs modes de vente**, activés selon le client :
- **menu de la semaine / du jour** avec précommande (l'actuel, le restaurant) ;
- **carte permanente** : produits avec catégories (burgers, boissons, desserts…), options et
  suppléments (sauce, taille, formule menu), disponibilité du jour ;
- **service à table** (restaurants) : plan de salle, ouverture d'une table, commandes successives,
  addition (éventuellement partagée) encaissée à la fin.

Et des modules associés : **caisse comptoir + TPE**, **écran ou impression des tickets cuisine**,
suivi des commandes en cours (en préparation, prête, servie), et pour les restaurants **gestion des
tables** et **prise de commande par les serveurs** (sur téléphone ou tablette).

### Questions à trancher

- [ ] **Combien de clients** la première année ?
- [ ] Chaque client a-t-il **son propre site vitrine**, ou certains n'ont-ils besoin que du back-office
  et de la prise de commande ?
- [ ] **Qui paie l'hébergement** (Vercel, Supabase, nom de domaine) : vous, refacturé au client, ou le client directement ?
- [ ] **Droits sur le code** : l'app a été construite pour le restaurant. Vérifier que vous pouvez la
  proposer à d'autres traiteurs (selon votre accord avec le restaurant).
- [ ] **Nom du produit** et nom de domaine de la plateforme.
- [ ] **Fast-food** : options et suppléments sur les produits (taille, sauce, formule menu) ?
  Écran en cuisine ou ticket imprimé ?
- [ ] **Restaurant** : plan de salle et tables, prise de commande par les serveurs, addition
  partagée, pourboires ?
- [x] ~~Par quel type de client commencer~~ : **les restaurateurs**.
- [ ] **Matériel** : imprimante de tickets (laquelle ?), tiroir-caisse, tablette ou ordinateur en caisse ?

---

## 5. Autres points en suspens

- [ ] **Photos des jus** : remplacer les illustrations provisoires. Les stocks réels sont à régler dans Catalogue.
- [x] ~~`.env` local~~ : pointe désormais vers la base Supabase du projet (du client).
- [ ] **Menus à recomposer** dans la nouvelle base (les anciens sont restés dans la base Lovable), et prix à vérifier (« riz au poulet » à 0 F, « fonio » à 20 F).
- [ ] **Photos des plats** : elles pointent encore vers le stockage de l'ancienne base Lovable ; à réimporter depuis le catalogue.
- [ ] **Témoignages** : remplacer les 5 avis d'exemple par de vrais avis clients.
- [x] ~~Audit gérant, points critiques~~ : l'impression échappe désormais les données clients, et la suppression d'un produit demande une confirmation.


## Intégré au modèle (4 octobre 2026)

Fonctionnalités génériques construites chez le restaurant avant la création des modèles
(`template-site`, `template-backoffice`) : à y reporter dès leur création (skill `restau-socle-modele`).

| Fonctionnalité | Site | Back-office | Migration |
| --- | --- | --- | --- |
| Abonnements | `src/features/subscriptions/`, `src/routes/abonnement.tsx`, `src/config/client.ts` | `src/features/admin/subscriptions/`, `src/routes/admin/abonnements.tsx` | `20261003180000_abonnements.sql` |
| Simulation (cuisson depuis le menu, invendus, prix du marché) | — | `src/features/admin/simulation/` | — |
