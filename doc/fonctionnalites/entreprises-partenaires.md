# Entreprises partenaires (module)

Module **générique**, désactivable par client (`src/config/client.ts` : `partners: true | false`).
Premier client : **SESA Catering** (restauration collective). Proposé en option à Ndelli's.

## Principe
Des entreprises partenaires (ex. RTS, 150 employés) ont un contrat avec le restaurant. Leurs **employés
enrôlés** commandent leur repas **à l'avance**, **sans payer** : l'**entreprise paie tout** en fin de mois.
Chaque jour de livraison produit un **bon de commande** par entreprise ; à la fin du mois, tous les bons
sont regroupés en une **facture** (ex. 22 bons = 1 facture).

## Décisions (5 octobre 2026)
| Point | Décision |
|---|---|
| Heure limite | **Réglable par entreprise** (par défaut : 6 h le matin du jour de livraison). Après, la commande passe au jour suivant. |
| Paiement | **L'entreprise paie tout** ; l'employé ne paie rien. |
| Menu | **Le même menu de la semaine pour tous** (particuliers et entreprises). |
| Identification | **Pas de compte ni de connexion** : au moment de valider sa commande, l'employé choisit **son entreprise**, saisit **son téléphone et son code** (4 chiffres, envoyé par SMS / WhatsApp à l'enrôlement). 5 essais faux → bloqué. |
| Jour même | Interdit : l'employé commande pour les jours suivants seulement (avant l'heure limite). |

## Côté gérant (page « Entreprises »)
- **Tableau de bord** (KPI du mois) : repas livrés aux entreprises, chiffre d'affaires (et évolution
  vs mois précédent), employés qui commandent / enrôlés, factures à encaisser ; **top entreprises**
  (chiffre d'affaires, repas, taux de participation), employés les plus fidèles, plats préférés.
- **Entreprises partenaires** : **logo**, nom, contact (nom, téléphone, email), adresse et heure de
  livraison, heure limite de commande, actif ou non.
- **Employés** par entreprise (après création) : nom, **téléphone**, **email**, code, actif /
  désactivé. Ajout un par un ou **import** : fichier **Excel (.xlsx)** ou **CSV**, **lien Google
  Sheets** partagé, ou copier-coller. **Modèle à télécharger** (Nom ; Prénom ; Téléphone ; Email) à
  envoyer à l'entreprise. Envoi du code par SMS ou WhatsApp.
- **Notifications** (cloche) : nouvelle commande d'entreprise, facture envoyée et impayée depuis plus
  de 30 jours, code employé bloqué (5 essais faux).
- **Bons de commande du jour** : un par entreprise — employés, plats, quantités, montant total ; PDF à
  imprimer / télécharger, case « livré et signé ».
- **Production** : total par plat et par entreprise (cuisine et livraison).
- **Facturation mensuelle** : par entreprise, regroupe les bons du mois (détail par jour et par employé),
  PDF + Excel, statut « à facturer → envoyée → payée ».

## Côté site (employé)
- L'employé choisit son plat dans le menu des jours à venir, comme tout le monde.
- Au panier, option **« Je commande pour mon entreprise »** : il choisit son entreprise dans la liste,
  saisit son téléphone et son code — c'est tout. Pas de compte, pas de mot de passe, pas de paiement
  (« facturé à votre entreprise »).
- Contrôles : employé enrôlé et actif dans cette entreprise, code correct, heure limite respectée,
  jour de livraison à venir.

## Données (prévu)
`partners`, `partner_employees`, `orders.partner_id` / `partner_employee_id`, statut de paiement
`facture_entreprise`, `partner_delivery_notes` (bon du jour), `partner_invoices` (facture du mois) ;
fonction `place_partner_order` (contrôle de l'heure limite et de l'employé, réservation du stock).
