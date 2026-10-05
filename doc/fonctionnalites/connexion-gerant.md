# Connexion gérant

**Code :** `src/features/auth/`

Permet au gérant d'accéder à l'espace de gestion.

**Route :** `/auth`

## Fonctionnement
- Connexion par email et mot de passe (Supabase Auth).
- **Le premier compte créé devient automatiquement administrateur** (fonction SQL `claim_admin`). Les comptes créés ensuite n'ont aucun droit.
- Si le gérant est déjà connecté, il est redirigé directement vers `/admin`.

## Fichiers
| Fichier | Rôle |
| --- | --- |
| `auth-page.tsx` | Onglets Connexion / Créer un compte, mot de passe oublié |

## Points relevés par l'audit
- 🟠 « Mot de passe oublié » envoie vers `/reset-password`, une page qui n'existe pas.
- 🟠 L'inscription reste ouverte à tous. Le compte gérant existant, il vaut mieux désactiver les inscriptions dans Supabase et retirer l'onglet « Créer un compte ».
