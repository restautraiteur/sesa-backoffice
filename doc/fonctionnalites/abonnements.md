# Abonnements repas

**Code :** site `src/features/subscriptions/` (page), `src/features/checkout/` (utilisation des repas),
`src/features/payment/` (paiement en ligne) · back-office `src/features/admin/subscriptions/`,
badge « Abonné » dans `src/features/admin/orders/`
**Pages :** site `/abonnement` · back-office `/admin/abonnements`

Fonctionnalité **générique** : à intégrer au modèle (`template-site`, `template-backoffice`).

## Principe
L'abonné achète un **crédit de N repas**. Il **commande comme tout le monde** sur le site, choisit le plat
du jour qu'il veut (s'il y en a plusieurs), puis entre son **téléphone + son code abonné à 4 chiffres** :
le repas est décompté de son abonnement, rien à payer. Pas d'espace client : le téléphone et le code
servent d'identité.

## Règles
- **Un repas par jour ouvré** (lundi → vendredi), à partir de la date de départ. Si le panier contient
  plusieurs plats ce jour-là, l'abonnement prend en charge **le moins cher** ; le reste (2ᵉ plat, jus,
  week-end, jours non couverts) se paie normalement (PayDunya).
- **Jour sans commande = repas reporté** : rien n'est perdu, la fin estimée recule. Les jours fermés aussi.
- **Paiement** : en une fois ou **moitié + solde**, **en ligne** (PayDunya, abonnement confirmé tout seul)
  ou **au téléphone** (le gérant encaisse et confirme). Le **solde doit être réglé avant le dernier
  repas** : sinon ce repas reste bloqué. L'abonné peut toujours commander en payant.
- **Abonnement pas encore confirmé** : les repas ne sont pas utilisables (message au client).
- **Code** : 5 essais faux → bloqué. Le gérant génère un nouveau code (bouton ↻), l'envoie par SMS ou WhatsApp.
- **Commande livrée** → repas « livré » ; **commande annulée** → le repas retourne au crédit.

## Côté client
- `/abonnement` : présentation, « Comment ça marche » (4 étapes), composition (formule avec prix par repas,
  calendrier de départ, coordonnées, règlement), récapitulatif fixe, FAQ.
- Après souscription : **le code abonné** s'affiche (et au retour du paiement en ligne).
- **Suivez vos repas** (téléphone seul, lecture) : repas restants, livrés, commandés, plat de chaque repas,
  fin estimée, reste à payer avec bouton « Payer en ligne » (code demandé).
- **Panier** : encadré « Vous êtes abonné ? » → code → jours couverts ou raison du refus, total réduit ;
  « Valider ma commande » sans paiement si tout est couvert. Confirmation : « il vous reste X repas ».

## Côté gérant
- **Repas du jour** : repas d'abonnés commandés ce jour-là (plat, référence), « Marquer livré » (livre la
  commande), bouton **« Prévenir »** : au choix SMS ou WhatsApp, avec le texte prêt : « votre repas est livré, il vous reste X repas sur N ».
- **Abonnés** : repas restants, encaissé / prix, mode de paiement, code ; Confirmer, **Encaisser**
  (acompte ou solde, avec historique), envoyer le code (SMS ou WhatsApp), nouveau code, annuler.
- **Formules** : nom, nombre de repas (1 à 60), prix, livraison incluse, visible ou non.
- **Commandes** : badge « Abonné », détail « montant pris en charge, reste X repas » et bouton « Prévenir » (SMS ou WhatsApp).
  Ticket de livraison : « Abonnement » (rien à encaisser).

## Données
- `subscriptions` (code, choix et mode de paiement, montant encaissé), `subscription_payments`,
  `subscription_meals` (un repas = une commande, `order_id`), `orders.subscription_id` et
  `subscription_discount`, statut de paiement de commande `abonnement`.
- Fonctions : `create_subscription`, `check_subscription` (panier), `place_order` (décompte),
  `lookup_subscriptions` (suivi, sans adresse ni code), `subscription_refusal` (règles).
- Migrations (dépôt back-office) : `20261003180000_abonnements.sql`,
  `20261003181000_abonnements_lecture_formules.sql`, `20261003210000_abonnements_credit_repas.sql`.
- Formules de départ : `supabase/seeds/abonnements.sql`.

## Configuration par client
- `src/config/client.ts` (site et back-office) : `name` ; sur le site, `subscriptions` active le module.
- Formules et prix : réglés par le gérant.

## Pour plus tard
- Statistiques : l'argent des abonnements (paiements) n'apparaît pas encore dans le tableau de bord ni
  les rapports ; les repas d'abonnés y comptent au prix du menu.
- Expiration du crédit (ex. repas à utiliser en 2 mois), retrait sur place, envoi automatique des SMS (passerelle LAfricaMobile envisagée).
