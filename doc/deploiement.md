# Déploiement

Ce dépôt est déployé par **un projet Vercel** (`<client>-backoffice`), relié au dépôt GitHub
`restautraiteur/<client>-backoffice`. Le build (`vite build`) produit automatiquement la sortie Vercel.

- **Dossier racine** : `./` (la racine du dépôt).
- **Variables d'environnement** : *Settings › Environment Variables* (import d'un fichier `.env` hors dépôt,
  une ligne `NOM=valeur`). Liste dans le `README.md`.
- **Branche de production** : `main`.

Le dépôt jumeau `<client>-site` est déployé par son propre projet Vercel. Les deux utilisent la même base Supabase
(`<ref-du-projet>`).
