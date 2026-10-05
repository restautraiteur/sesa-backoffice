-- Catégories de plats (types de cuisine : sénégalaise, marocaine, asiatique…), gérées dans le catalogue.
create table public.dish_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.products add column dish_category_id uuid references public.dish_categories(id) on delete set null;

grant select on public.dish_categories to anon, authenticated;
grant insert, update, delete on public.dish_categories to authenticated;
grant all on public.dish_categories to service_role;
alter table public.dish_categories enable row level security;
create policy "catégories visibles de tous" on public.dish_categories for select to anon, authenticated using (true);
create policy "admins gèrent les catégories" on public.dish_categories
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

insert into public.dish_categories (name, sort_order) values
  ('Sénégalaise', 1), ('Africaine', 2), ('Marocaine', 3), ('Européenne', 4), ('Asiatique', 5),
  ('Fast-food', 6), ('Salades', 7), ('Desserts', 8);

-- Menu : on ajoute la catégorie du plat (colonne en fin de vue).
create or replace view public.menu_view with (security_invoker = on) as
 SELECT dp.id AS day_product_id,
    d.id AS day_id,
    d.date AS day_date,
    d.is_open AS day_open,
    w.id AS week_id,
    w.start_date,
    w.end_date,
    p.id AS product_id,
    p.name,
    p.description,
    p.photo_url,
    p.category,
    dp.price,
    dp.stock_initial,
    dp.stock_reserved,
    GREATEST((dp.stock_initial - dp.stock_reserved), 0) AS stock_left,
    COALESCE(dp.open_time, d.open_time) AS open_time,
    COALESCE(dp.close_time, d.close_time) AS close_time,
    dp.is_active,
        CASE
            WHEN ((NOT dp.is_active) OR (NOT p.active)) THEN 'desactive'::text
            WHEN (NOT d.is_open) THEN 'jour_ferme'::text
            WHEN ((dp.stock_initial - dp.stock_reserved) <= 0) THEN 'epuise'::text
            WHEN (((now() AT TIME ZONE 'UTC'::text))::date > d.date) THEN 'ferme'::text
            WHEN ((((now() AT TIME ZONE 'UTC'::text))::date = d.date) AND (((now() AT TIME ZONE 'UTC'::text))::time without time zone >= COALESCE(dp.close_time, d.close_time))) THEN 'ferme'::text
            ELSE 'disponible'::text
        END AS state,
    dc.name AS dish_category
   FROM day_products dp
     JOIN days d ON d.id = dp.day_id
     JOIN weeks w ON w.id = d.week_id
     JOIN products p ON p.id = dp.product_id
     LEFT JOIN dish_categories dc ON dc.id = p.dish_category_id;
