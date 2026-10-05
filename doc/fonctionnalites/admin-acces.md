# Coque de l'espace gérant

**Code :** `src/features/admin/layout/`

## Fonctionnement
- Vérifie qu'un utilisateur est connecté. Sinon, redirige vers `/auth`.
- Vérifie qu'il est administrateur (`is_admin`). Sinon, tente `claim_admin`, qui ne marche que s'il n'existe encore aucun administrateur, puis affiche « Accès refusé ».
- Header avec la navigation (Tableau de bord, Semaines & menus, Produits, Commandes), un lien « Voir le site » et le bouton Déconnexion.
- Les pages gérant ne sont pas indexées par Google (`noindex`).

## Fichiers
| Fichier | Rôle |
| --- | --- |
| `admin-layout.tsx` | Contrôle d'accès, header et navigation |
