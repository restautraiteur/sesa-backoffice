-- ROLES
create type public.app_role as enum ('admin');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  role app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;
create policy "own roles readable" on public.user_roles for select to authenticated using (user_id = auth.uid());

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'admin')
$$;

-- WEEKS
create table public.weeks (
  id uuid primary key default gen_random_uuid(),
  start_date date not null,
  end_date date not null,
  status text not null default 'draft',
  published_at timestamptz,
  created_at timestamptz not null default now()
);
grant select on public.weeks to anon;
grant select, insert, update, delete on public.weeks to authenticated;
grant all on public.weeks to service_role;
alter table public.weeks enable row level security;
create policy "published weeks public" on public.weeks for select to anon using (status = 'published');
create policy "admins manage weeks" on public.weeks for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "published weeks auth" on public.weeks for select to authenticated using (status = 'published');

-- DAYS
create table public.days (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null references public.weeks(id) on delete cascade,
  date date not null,
  is_open boolean not null default true,
  open_time time not null default '08:00',
  close_time time not null default '14:00',
  created_at timestamptz not null default now(),
  unique (week_id, date)
);
grant select on public.days to anon;
grant select, insert, update, delete on public.days to authenticated;
grant all on public.days to service_role;
alter table public.days enable row level security;
create policy "days public" on public.days for select to anon using (exists (select 1 from public.weeks w where w.id = week_id and w.status = 'published'));
create policy "days auth read" on public.days for select to authenticated using (true);
create policy "admins manage days" on public.days for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- PRODUCTS
create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  photo_url text,
  category text not null default 'plat',
  base_price integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
grant select on public.products to anon;
grant select, insert, update, delete on public.products to authenticated;
grant all on public.products to service_role;
alter table public.products enable row level security;
create policy "products public" on public.products for select to anon using (true);
create policy "products auth read" on public.products for select to authenticated using (true);
create policy "admins manage products" on public.products for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- DAY PRODUCTS
create table public.day_products (
  id uuid primary key default gen_random_uuid(),
  day_id uuid not null references public.days(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  price integer not null default 0,
  stock_initial integer not null default 0,
  stock_reserved integer not null default 0,
  open_time time,
  close_time time,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (day_id, product_id)
);
grant select on public.day_products to anon;
grant select, insert, update, delete on public.day_products to authenticated;
grant all on public.day_products to service_role;
alter table public.day_products enable row level security;
create policy "day_products public" on public.day_products for select to anon using (exists (select 1 from public.days d join public.weeks w on w.id = d.week_id where d.id = day_id and w.status = 'published'));
create policy "day_products auth read" on public.day_products for select to authenticated using (true);
create policy "admins manage day_products" on public.day_products for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ORDERS
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  first_name text not null,
  last_name text not null,
  phone text not null,
  address text not null,
  address_extra text,
  landmark text,
  instructions text,
  total integer not null default 0,
  status text not null default 'nouvelle',
  payment_status text not null default 'non_paye',
  payment_method text,
  payment_reference text,
  paid_amount integer not null default 0,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.orders to authenticated;
grant all on public.orders to service_role;
alter table public.orders enable row level security;
create policy "admins manage orders" on public.orders for all to authenticated using (public.is_admin()) with check (public.is_admin());

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  day_product_id uuid references public.day_products(id) on delete set null,
  day_date date not null,
  product_name text not null,
  category text not null,
  quantity integer not null,
  unit_price integer not null,
  amount integer not null
);
grant select, insert, update, delete on public.order_items to authenticated;
grant all on public.order_items to service_role;
alter table public.order_items enable row level security;
create policy "admins manage order_items" on public.order_items for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- PUBLIC MENU VIEW
create view public.menu_view with (security_invoker = on) as
select
  dp.id as day_product_id,
  d.id as day_id,
  d.date as day_date,
  d.is_open as day_open,
  w.id as week_id,
  w.start_date,
  w.end_date,
  p.id as product_id,
  p.name,
  p.description,
  p.photo_url,
  p.category,
  dp.price,
  dp.stock_initial,
  dp.stock_reserved,
  greatest(dp.stock_initial - dp.stock_reserved, 0) as stock_left,
  coalesce(dp.open_time, d.open_time) as open_time,
  coalesce(dp.close_time, d.close_time) as close_time,
  dp.is_active,
  case
    when not dp.is_active or not p.active then 'desactive'
    when not d.is_open then 'jour_ferme'
    when (dp.stock_initial - dp.stock_reserved) <= 0 then 'epuise'
    when (now() at time zone 'UTC')::date > d.date then 'ferme'
    when (now() at time zone 'UTC')::date = d.date
      and (now() at time zone 'UTC')::time >= coalesce(dp.close_time, d.close_time) then 'ferme'
    else 'disponible'
  end as state
from public.day_products dp
join public.days d on d.id = dp.day_id
join public.weeks w on w.id = d.week_id
join public.products p on p.id = dp.product_id;

grant select on public.menu_view to anon, authenticated;
grant all on public.menu_view to service_role;

-- PLACE ORDER (atomic, server-side validation)
create or replace function public.place_order(p_customer jsonb, p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_dp record;
  v_qty int;
  v_total int := 0;
  v_order_id uuid;
  v_ref text;
  v_seq int;
  v_now timestamp := (now() at time zone 'UTC');
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Votre panier est vide.';
  end if;
  if coalesce(trim(p_customer->>'first_name'),'') = ''
     or coalesce(trim(p_customer->>'last_name'),'') = ''
     or coalesce(trim(p_customer->>'phone'),'') = ''
     or coalesce(trim(p_customer->>'address'),'') = '' then
    raise exception 'Informations client incomplètes.';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := coalesce((v_item->>'quantity')::int, 0);
    if v_qty <= 0 or v_qty > 200 then
      raise exception 'Quantité invalide.';
    end if;

    select dp.id, dp.price, dp.stock_initial, dp.stock_reserved, dp.is_active,
           d.date as day_date, d.is_open, w.status as week_status,
           coalesce(dp.close_time, d.close_time) as close_time,
           p.name, p.category, p.active as product_active
    into v_dp
    from public.day_products dp
    join public.days d on d.id = dp.day_id
    join public.weeks w on w.id = d.week_id
    join public.products p on p.id = dp.product_id
    where dp.id = (v_item->>'day_product_id')::uuid
    for update of dp;

    if not found then raise exception 'Produit introuvable.'; end if;
    if v_dp.week_status <> 'published' then raise exception 'Ce menu n''est pas disponible.'; end if;
    if not v_dp.is_active or not v_dp.product_active then raise exception '% n''est plus disponible.', v_dp.name; end if;
    if not v_dp.is_open then raise exception 'Les commandes du % sont fermées.', v_dp.day_date; end if;
    if v_now::date > v_dp.day_date or (v_now::date = v_dp.day_date and v_now::time >= v_dp.close_time) then
      raise exception 'L''heure limite de commande pour % est dépassée.', v_dp.name;
    end if;
    if v_dp.stock_initial - v_dp.stock_reserved < v_qty then
      raise exception 'Désolé, % : il ne reste que % portion(s).', v_dp.name, greatest(v_dp.stock_initial - v_dp.stock_reserved, 0);
    end if;

    v_total := v_total + v_qty * v_dp.price;
  end loop;

  select count(*)::int + 1 into v_seq from public.orders where created_at::date = v_now::date;
  v_ref := 'CMD-' || to_char(v_now, 'YYYYMMDD') || '-' || lpad(v_seq::text, 3, '0');

  insert into public.orders (reference, first_name, last_name, phone, address, address_extra, landmark, instructions, total)
  values (
    v_ref,
    trim(p_customer->>'first_name'),
    trim(p_customer->>'last_name'),
    trim(p_customer->>'phone'),
    trim(p_customer->>'address'),
    nullif(trim(coalesce(p_customer->>'address_extra','')), ''),
    nullif(trim(coalesce(p_customer->>'landmark','')), ''),
    nullif(trim(coalesce(p_customer->>'instructions','')), ''),
    v_total
  )
  returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := (v_item->>'quantity')::int;
    select dp.id, dp.price, d.date as day_date, p.name, p.category
    into v_dp
    from public.day_products dp
    join public.days d on d.id = dp.day_id
    join public.products p on p.id = dp.product_id
    where dp.id = (v_item->>'day_product_id')::uuid;

    update public.day_products set stock_reserved = stock_reserved + v_qty where id = v_dp.id;

    insert into public.order_items (order_id, day_product_id, day_date, product_name, category, quantity, unit_price, amount)
    values (v_order_id, v_dp.id, v_dp.day_date, v_dp.name, v_dp.category, v_qty, v_dp.price, v_qty * v_dp.price);
  end loop;

  return jsonb_build_object('reference', v_ref, 'total', v_total, 'order_id', v_order_id);
end;
$$;

revoke all on function public.place_order(jsonb, jsonb) from public;
grant execute on function public.place_order(jsonb, jsonb) to anon, authenticated, service_role;