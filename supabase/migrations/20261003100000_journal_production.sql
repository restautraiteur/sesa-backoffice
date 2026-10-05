-- Simulation de production et des dépenses.
--   * Ingrédients mesurés dans une unité de base (g, ml ou pièce) — table ingredients existante.
--   * Formats d'achat par ingrédient (boîte 300 g, boîte 500 g, sac 5 kg…), chacun avec son prix.
--   * Journal de production : après chaque cuisson, ce qui a été réellement utilisé et le nombre
--     de plats obtenus. Le simulateur en déduit les quantités par plat (moyenne des 3 dernières cuissons).

-- Unité de base de l'ingrédient : g, ml ou piece (la colonne unit existe déjà, valeur par défaut 'kg').
alter table public.ingredients alter column unit set default 'g';

create table public.ingredient_formats (
  id uuid primary key default gen_random_uuid(),
  ingredient_id uuid not null references public.ingredients(id) on delete cascade,
  label text not null,                                   -- ex. « Boîte 500 g »
  size numeric not null check (size > 0),                -- contenance, dans l'unité de base de l'ingrédient
  price integer not null default 0 check (price >= 0),   -- prix du format en FCFA
  is_default boolean not null default false,             -- format habituel, utilisé par le simulateur
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_ingredient_formats_ingredient on public.ingredient_formats(ingredient_id);
-- Un seul format habituel par ingrédient
create unique index uniq_ingredient_default_format
  on public.ingredient_formats(ingredient_id) where is_default;

create table public.production_logs (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  day_product_id uuid references public.day_products(id) on delete set null,
  cooked_on date not null default (now() at time zone 'Africa/Dakar')::date,
  plates_obtained integer not null check (plates_obtained > 0),
  excluded boolean not null default false,               -- cuisson ratée : ignorée par le simulateur
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_production_logs_product on public.production_logs(product_id, cooked_on desc);
create index idx_production_logs_day on public.production_logs(cooked_on);

create table public.production_log_items (
  id uuid primary key default gen_random_uuid(),
  log_id uuid not null references public.production_logs(id) on delete cascade,
  ingredient_id uuid not null references public.ingredients(id) on delete restrict,
  format_label text not null,                            -- copie du libellé du format utilisé
  format_count numeric not null check (format_count > 0),-- ex. 2 (boîtes), 8,5 (kg)
  quantity numeric not null check (quantity > 0),        -- total dans l'unité de base (format_count × contenance)
  cost integer not null default 0 check (cost >= 0),     -- coût au prix du jour de la cuisson
  created_at timestamptz not null default now()
);
create index idx_production_log_items_log on public.production_log_items(log_id);

-- Droits : réservé au gérant
grant select, insert, update, delete on public.ingredient_formats, public.production_logs,
  public.production_log_items to authenticated;
grant all on public.ingredient_formats, public.production_logs, public.production_log_items
  to service_role;

alter table public.ingredient_formats enable row level security;
alter table public.production_logs enable row level security;
alter table public.production_log_items enable row level security;

create policy "admins manage ingredient_formats" on public.ingredient_formats
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins manage production_logs" on public.production_logs
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins manage production_log_items" on public.production_log_items
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create trigger touch_ingredient_formats_updated before update on public.ingredient_formats
  for each row execute function public.touch_updated_at();
create trigger touch_production_logs_updated before update on public.production_logs
  for each row execute function public.touch_updated_at();
