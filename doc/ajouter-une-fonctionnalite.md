# Ajouter une nouvelle fonctionnalité

Exemple suivi tout au long du guide : une page gérant **« Promotions »** à l'adresse `/admin/promotions`.
Remplacez « promotions » par le nom de votre fonctionnalité.

## Checklist

- [ ] 1. Créer le dossier de la fonctionnalité dans la bonne application (`apps/site` ou `apps/admin`)
- [ ] 2. Créer la table dans la base (migration + sécurité) si la fonctionnalité stocke des données
- [ ] 3. Écrire les requêtes dans `api.ts`
- [ ] 4. Écrire la page et ses composants
- [ ] 5. Déclarer la route dans `apps/<app>/src/routes/`
- [ ] 6. Ajouter le lien dans la navigation
- [ ] 7. Vérifier (TypeScript, lint, build, test dans le navigateur)
- [ ] 8. Écrire la fiche dans `doc/fonctionnalites/` et l'ajouter au sommaire `doc/README.md`

---

## 1. Créer le dossier

```
apps/admin/src/features/admin/promotions/      ← fonctionnalité gérant
├── api.ts                          types + requêtes Supabase
├── promotions-page.tsx             la page
└── components/                     sous-composants (si la page devient longue)
```

- Fonctionnalité **côté client** : `src/features/<nom>/`.
- Fonctionnalité **côté gérant** : `src/features/admin/<nom>/`.
- Noms de fichiers en minuscules avec des tirets (`promotion-card.tsx`).
- Un composant utile à plusieurs fonctionnalités d'une même app va dans `apps/<app>/src/components/`.
- Du code utile **aux deux applications** (requêtes, types, formats) va dans `src/core/`,
  importé avec `@core/…` ; un composant d'interface commun va dans `src/ui/`, importé avec `@ui/…`.

## 2. Base de données (si besoin)

Créez un fichier dans `supabase/migrations/`, nommé `AAAAMMJJHHMMSS_description.sql`.
**Activez toujours la sécurité au niveau des lignes** : sans elle, n'importe qui peut lire ou modifier la table.

```sql
create table public.promotions (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  percent integer not null check (percent between 1 and 90),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

grant select, insert, update, delete on public.promotions to authenticated;
grant all on public.promotions to service_role;
alter table public.promotions enable row level security;

-- Seul le gérant peut gérer les promotions
create policy "admins manage promotions" on public.promotions
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Si les clients doivent les voir :
-- grant select on public.promotions to anon;
-- create policy "promotions public" on public.promotions for select to anon using (active);
```

⚠️ Un fichier de migration créé en local **ne s'applique pas tout seul** à la base en ligne.
Faites la modification de la base depuis Lovable, qui applique la migration, ou avec le CLI Supabase (`supabase db push`).

Règles à respecter :
- Ajoutez des contraintes `check` sur les montants, stocks et pourcentages (pas de valeurs négatives).
- Toute opération qui touche à plusieurs tables à la fois (stock + commande, par exemple) se fait dans une **fonction SQL** (voir `place_order`), jamais en plusieurs appels depuis le navigateur.

## 3. Requêtes : `api.ts`

Suivez le modèle des autres fonctionnalités (par exemple `src/features/admin/products/api.ts`) :

```ts
import { queryOptions } from "@tanstack/react-query";
import { db, run } from "@core/lib/db";

export type Promotion = {
  id: string;
  label: string;
  percent: number;
  active: boolean;
};

export const promotionsQuery = () =>
  queryOptions({
    queryKey: ["promotions"],
    queryFn: () => run<Promotion[]>(db.from("promotions").select("*").order("created_at")),
  });
```

- Pour lire les données d'une autre fonctionnalité, importez **son** `api.ts` (`@/features/menu/api`, `@/features/admin/orders/api`…).
- Pour écrire, utilisez `useMutation` dans la page, puis `queryClient.invalidateQueries({ queryKey: ["promotions"] })` pour rafraîchir l'affichage.

## 4. La page

```tsx
// apps/admin/src/features/admin/promotions/promotions-page.tsx
import { useQuery } from "@tanstack/react-query";

import { promotionsQuery } from "./api";

export function PromotionsPage() {
  const { data: promotions = [] } = useQuery(promotionsQuery());
  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-bold">Promotions</h1>
      {/* … */}
    </div>
  );
}
```

- Réutilisez les composants de `src/ui/components/ui/` (`@ui/components/ui/…`) (Button, Input, Dialog, Switch…) et les couleurs du thème (`text-primary`, `bg-accent`, `surface-card`…) pour garder le même style.
- Demandez une **confirmation** avant toute suppression ou action irréversible.
- N'insérez jamais une donnée saisie par un client dans du HTML construit à la main (`document.write`, `innerHTML`) sans l'échapper.

## 5. La route

Le fichier de route ne contient **que** l'URL et les balises `<head>`. Le nom du fichier donne l'URL :
`src/routes/admin/promotions.tsx` → `/admin/promotions`.

```tsx
// src/routes/admin/promotions.tsx
import { createFileRoute } from "@tanstack/react-router";

import { PromotionsPage } from "@/features/admin/promotions/promotions-page";

export const Route = createFileRoute("/admin/promotions")({
  head: () => ({ meta: [{ title: "Promotions — le restaurant" }] }),
  component: PromotionsPage,
});
```

- Ne modifiez **jamais** `routeTree.gen.ts` : il est régénéré automatiquement par `npm run dev` / `dev:admin`.
- Les pages sous `/admin/` sont automatiquement protégées par le contrôle d'accès gérant (`admin-layout.tsx`).
- Une page client utilise `SiteHeader` et `SiteFooter` (`@/components/site-header`).

## 6. Navigation

- **Gérant :** ajoutez une ligne dans `NAV` (`src/features/admin/layout/admin-layout.tsx`) :
  ```ts
  { to: "/admin/promotions", label: "Promotions", icon: Percent, exact: false },
  ```
  (icône à importer depuis `lucide-react`).
- **Client :** ajoutez le lien dans `src/components/site-header.tsx`.

## 7. Vérifier

```bash
npx tsc --noEmit -p apps/admin   # aucune erreur TypeScript (ou apps/site)
npx eslint src/features    # pas de nouveau problème
npm run build:admin               # le build de production passe (ou build:site)
```

Ensuite, ouvrez la page sur http://localhost:8081 (admin) ou http://localhost:8080 (site) et testez le parcours complet, sur ordinateur **et sur téléphone**.

## 8. Documenter

1. Copiez une fiche existante de `doc/fonctionnalites/` (par exemple `admin-produits.md`) sous le nom de la nouvelle fonctionnalité.
2. Remplissez les rubriques : à quoi elle sert, la page, son fonctionnement et ses règles métier, ses fichiers.
3. Ajoutez une ligne dans le tableau de [`README.md`](README.md).
