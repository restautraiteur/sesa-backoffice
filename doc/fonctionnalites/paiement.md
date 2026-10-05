# Paiement (PayDunya)

**Code :** `src/features/payment/`

Encaisse le total, ou l'acompte d'une précommande, par PayDunya (Wave, Orange Money, carte…).

## Fonctionnement
1. `startPayment` (fonction serveur) crée une facture PayDunya du bon montant et enregistre son jeton sur la commande.
2. Le client paie sur la page de PayDunya.
3. PayDunya renvoie le client vers `/confirmation` et prévient le site par l'**IPN** (`/api/public/paydunya-ipn`).
4. `syncPayment` **revérifie toujours le paiement auprès de PayDunya**, sans se fier au message reçu. Il passe ensuite la commande à :
   - `paye` (commande immédiate) ou `acompte_paye` (précommande) si le paiement est confirmé ;
   - `echec_paiement` si le paiement est annulé ou échoué.

## Configuration
Variables d'environnement côté serveur : `PAYDUNYA_MASTER_KEY`, `PAYDUNYA_PRIVATE_KEY`, `PAYDUNYA_TOKEN`.
Sans ces clés, le client voit le message « Le paiement est momentanément indisponible ».

## Fichiers
| Fichier | Rôle |
| --- | --- |
| `paydunya.server.ts` | Appels à l'API PayDunya (créer, confirmer, synchroniser) |
| `paydunya.functions.ts` | Fonctions serveur `startPayment` et `checkPayment` appelées par le site |
| `src/routes/api/public/paydunya-ipn.ts` | Notification serveur à serveur de PayDunya |

## Acompte de précommande (4 octobre 2026)
- **1 500 F par plat** des jours suivants (2 plats → 3 000 F). Panier mixte : plats du jour payés en entier + acompte pour les jours suivants ; les jus suivent le premier jour de livraison (payés maintenant s'il s'agit d'aujourd'hui). Le reste se paie à la livraison.
- Calcul fait par la base (`place_order`, migration `20261004110000_acompte_par_plat.sql`) ; `orders.deposit_required` = somme payée maintenant. Le panier affiche « À payer maintenant » avec le détail et le reste à la livraison.
