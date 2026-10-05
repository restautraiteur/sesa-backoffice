# Simulation de production et des dépenses

**Code :** `src/features/admin/simulation/`

Le gérant connaît **trois chiffres** pour un jour ou une semaine : la **somme à recevoir**, les
**dépenses** et le **bénéfice**. Il obtient aussi la **liste de courses**. Tout est calculé à
partir de ce qui s'est réellement passé lors des cuissons précédentes.

**Route :** `/admin/simulation` (menu « Simulation » de l'espace gérant)

## Le flow (la journée d'un plat)

```
LE MATIN (marché)                    APRÈS LA CUISSON                       LE SOIR (automatique)
Liste de courses prête :             Menus › plat du jour › 🧑‍🍳 Cuisson       Prévisions › Réel à ce jour
calculée sur les cuissons            • ingrédients utilisés (5 kg riz…)     • plats vendus / obtenus
précédentes, à copier ou à           • prix payé (facultatif)               • invendus perdus (en F)
envoyer sur WhatsApp                 • plats obtenus : 52                   • encaissé, dépensé
                                     → le STOCK du plat passe à 52          • bénéfice réel
```

Un plat par jour de courses. Les invendus sont perdus : ils sont comptés comme une perte.

### 1. Ingrédients (une fois)
- Nom et unité de base : grammes, millilitres ou pièces.
- **Prix au kilo, au litre ou à la pièce** : facultatif, et **mis à jour automatiquement avec le dernier prix
  payé au marché** lors de chaque cuisson.
- **Formats d'achat** (boîte 500 g, sac 5 kg…) : facultatifs. S'il y en a, la liste de courses les utilise
  (arrondi à l'unité supérieure) ; sinon elle donne la quantité exacte.
- Les emballages et le gaz peuvent être des ingrédients (« Barquette », en pièces) pour compter dans les dépenses.

### 2. Enregistrer la cuisson (chaque jour)
- **Depuis Menus** : sur le plat du jour, bouton **toque (Cuisson)**. Le plat et la date sont pré-remplis ;
  si une fiche existe déjà pour ce jour, elle s'ouvre pour modification. Aussi possible depuis
  Simulation › Journal de production.
- Pour chaque ingrédient : **quantité** dans l'unité de son choix (kg, g, L, ml, pièces ou un format d'achat)
  et **prix payé** facultatif (sans prix : dernier prix connu).
- **Plats obtenus** (au moins le nombre déjà commandé).
- À l'enregistrement : **le stock du plat du jour prend le nombre de plats obtenus** (les clients peuvent
  commander) et les prix payés deviennent les nouveaux prix de référence.
- Une cuisson ratée peut être **écartée** des calculs depuis le journal.

### 3. Prévisions (jour ou semaine)
- **Somme à recevoir** (assurée par les commandes, dont déjà payée, et si tout est vendu), **dépenses
  prévues**, **bénéfice prévu**.
- **Réel à ce jour** : plats vendus / obtenus, **invendus perdus** (nombre et valeur au coût du plat),
  encaissé, dépensé, bénéfice réel.
- **Plats à cuisiner** : précommandes, portions prévues, nombre à cuisiner modifiable, alerte s'il est
  inférieur aux précommandes.
- **Recette moyenne** de chaque plat (pour 1 plat), calculée sur l'historique.
- **Liste de courses** dans les formats habituels ou en quantité exacte, avec boutons **Copier** et
  **WhatsApp**.

## Règles de calcul
- **Quantité par plat** d'un ingrédient = total utilisé sur les **3 dernières cuissons non
  écartées** du plat ÷ total des plats obtenus sur ces cuissons.
- **Quantité nécessaire** = quantité par plat × plats à cuisiner.
- **À acheter** = quantité nécessaire ÷ contenance du format habituel, **arrondi au-dessus**
  (1,38 kg de tomate → 3 boîtes de 500 g). Sans format : la quantité exacte au prix de référence.
- **Invendus** = plats obtenus − plats commandés ; **perte** = invendus × (dépense de la cuisson ÷ plats obtenus).
- Un plat **sans fiche de production** est signalé « pas encore d'historique » et n'est pas compté
  dans les dépenses.

## Données
| Table | Contenu |
| --- | --- |
| `ingredients` | Nom et unité de base (`g`, `ml`, `piece`) |
| `ingredient_formats` | Formats d'achat : libellé, contenance, prix, format habituel |
| `production_logs` | Une cuisson : plat, date, plats obtenus, écartée ou non, notes |
| `production_log_items` | Ingrédients utilisés : format (libellé copié), nombre, quantité totale, coût |

Migration : `supabase/migrations/20261003100000_journal_production.sql`.

## Fichiers
| Fichier | Rôle |
| --- | --- |
| `api.ts` | Types, requêtes et calculs (`dishRatio`, `shoppingList`, `defaultFormat`…) |
| `simulation-page.tsx` | Page et onglets |
| `components/forecast-panel.tsx` | Prévisions : trois chiffres, plats à cuisiner, liste de courses |
| `components/production-panel.tsx` | Journal des cuissons |
| `components/production-dialog.tsx` | Fiche de cuisson (aussi ouverte depuis Menus), mise à jour du stock et des prix |
| `components/ingredients-panel.tsx` | Ingrédients et formats d'achat |

## Pour plus tard
- Estimation saisie à la main pour un plat jamais cuisiné.
- Bases communes à plusieurs plats (une sauce pour deux plats) et répartition des quantités.
- Restes après cuisson (boîte entamée), pour ne compter que le consommé.
- Charges fixes (loyer, salaires), réparties sur le mois, pour le vrai bénéfice net.
- Choix automatique de la meilleure combinaison de formats (1 boîte de 1 kg + 1 de 500 g…).
- Lien avec le module Caisse & dépenses : prix des formats mis à jour par les achats saisis.

## Simuler à partir d'une journée de référence (onglet « Simuler »)

**1. Fin de journée → « Ajouter comme référence »** (tableau de bord, à côté de chaque plat du jour,
aujourd'hui ou un jour passé). La fiche de cuisson s'ouvre en mode référence :
- plats **préparés**, plats **vendus** (repris des commandes, repas d'abonnés compris, modifiable),
  invendus, **chiffre d'affaires** (vendus × prix du plat), « épuisé » ;
- les **achats** de ce plat (quantité, unité, prix payé facultatif). Si la cuisson a déjà été notée,
  ils sont repris.
La journée est enregistrée comme référence (`production_logs.is_reference`, `plates_sold`, `revenue`,
`sold_out`, `closed_at` — migration `20261004090000_references_simulation.sql`).

**2. Simuler** : un plat, le menu d'un jour (2 plats ou plus) ou la semaine.
- Une référence par plat : la plus récente par défaut, ou une autre au choix.
- Quantité : ÷ 2, même quantité, × 1,5, × 2 pour tous les plats ; par plat, un nombre de plats à
  préparer ; ou une quantité d'ingrédient (« 8 kg de viande au lieu de 5 ») — le reste suit en
  proportion.
- Résultat par plat et au total : plats préparés, ventes estimées (même taux de vente qu'à la
  référence), chiffre d'affaires (prix actuel), coût des ingrédients (derniers prix connus), bénéfice,
  liste de courses (Copier, WhatsApp).
- **Appliquer au menu** : met les quantités comme stock des plats au menu à venir (jamais moins que
  les plats déjà commandés).

**3. Comparer** : le jour simulé, le tableau de bord montre le réel ; ce jour peut devenir à son tour
une référence.
