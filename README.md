# template-backoffice

> **Modèle** de la plateforme restautraiteur. Ne pas le déployer tel quel : chaque client reçoit une copie
> (`gh repo create restautraiteur/<client>-backoffice --private --template restautraiteur/template-backoffice`), puis on la
> personnalise (voir `doc/personnaliser.md`).

Ce dépôt contient l'**espace gérant** d'un restaurant : tableau de bord, menus, catalogue, commandes, abonnements, bilan, simulation, notifications — et les **migrations de la base Supabase**.

Il fait partie de la plateforme **restautraiteur** : chaque client a deux dépôts, `<client>-site` et
`<client>-backoffice`. Le modèle jumeau est `restautraiteur/template-site`.

## Lancer en local

```bash
npm install      # ou : bun install
npm run dev      # http://localhost:8081
```

Copier `.env.example` en `.env` et y mettre les clés **publiques** du projet Supabase du client.

## Organisation

```
src/
├── routes/      une page = un fichier (URL et <head>)
├── features/    le code de chaque fonctionnalité
├── components/  composants propres à ce dépôt
├── core/        commun : accès à la base (@core/lib/db), formats, requêtes du menu et des jus, client Supabase
└── ui/          commun : composants d'interface shadcn (@ui/components/ui/…)
doc/             documentation (sommaire : doc/README.md)
```

`src/core` et `src/ui` sont identiques dans les deux dépôts du client : une correction doit être reportée dans
le dépôt jumeau.

## Variables d'environnement (Vercel)

| Variable | Rôle |
| --- | --- |
| `VITE_SUPABASE_URL`, `SUPABASE_URL` | Adresse de la base Supabase |
| `VITE_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_PUBLISHABLE_KEY` | Clé publique Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Clé serveur (secrète) |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `PUSH_WEBHOOK_SECRET` | Notifications push du gérant (`node scripts/generate-vapid-keys.mjs`) |
| `VITE_SITE_URL` | Adresse du site client (lien « Voir le site client ») |
| `BREVO_API_KEY` (ou `RESEND_API_KEY`), `INVOICE_FROM_EMAIL` | Envoi des factures par email aux entreprises (compte brevo.com ; ex. `SESA Catering <factures@domaine.com>`) |
| `CRON_SECRET` | Protège la tâche quotidienne `/api/cron/invoices` (vercel.json) qui envoie les factures automatiques |

## Base de données

Les migrations sont dans `supabase/migrations/` (ce dépôt possède la base). Avant de les appliquer :
`supabase link --project-ref <ref-du-projet-du-client>`, puis `supabase db push --linked --dry-run`.

Les secrets ne vont jamais dans Git : uniquement dans Vercel, ou dans un fichier `.env` hors dépôt.
