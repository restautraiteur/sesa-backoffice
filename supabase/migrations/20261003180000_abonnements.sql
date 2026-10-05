-- Abonnements (« Mangez ici toute la semaine ») — fonctionnalité générique, à intégrer au modèle.
-- Le client choisit une formule (N repas) et une date de début ; les repas tombent sur les jours ouverts
-- (lundi → vendredi, en sautant les jours fermés), la date de fin est calculée côté serveur.
-- Pas de paiement en ligne : le restaurant rappelle, puis le gérant marque l'abonnement comme payé.

create table public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  meals_count integer not null check (meals_count between 1 and 60),
  price integer not null default 0 check (price >= 0),
  delivery_included boolean not null default true,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid references public.subscription_plans(id) on delete set null,
  plan_name text not null,                    -- copie au moment de la souscription
  meals_count integer not null check (meals_count > 0),
  price integer not null check (price >= 0),
  customer_name text not null,
  phone text not null,                        -- chiffres uniquement (normalisé)
  address text,
  start_date date not null,
  end_date date not null,
  status text not null default 'en_attente'
    check (status in ('en_attente', 'active', 'annulee')),
  payment_status text not null default 'non_paye' check (payment_status in ('non_paye', 'paye')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_subscriptions_phone on public.subscriptions(phone);

create table public.subscription_meals (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  meal_date date not null,
  status text not null default 'prevu' check (status in ('prevu', 'pris', 'annule')),
  unique (subscription_id, meal_date)
);
create index idx_subscription_meals_date on public.subscription_meals(meal_date);

-- Droits : formules actives lisibles par tous ; le reste réservé au gérant (accès client via fonctions).
grant select on public.subscription_plans to anon, authenticated;
grant insert, update, delete on public.subscription_plans to authenticated;
grant select, insert, update, delete on public.subscriptions, public.subscription_meals to authenticated;
grant all on public.subscription_plans, public.subscriptions, public.subscription_meals to service_role;

alter table public.subscription_plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.subscription_meals enable row level security;

create policy "formules actives publiques" on public.subscription_plans
  for select to anon, authenticated using (active or public.is_admin());
create policy "admins gèrent les formules" on public.subscription_plans
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins gèrent les abonnements" on public.subscriptions
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins gèrent les repas d'abonnement" on public.subscription_meals
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create trigger touch_subscription_plans_updated before update on public.subscription_plans
  for each row execute function public.touch_updated_at();
create trigger touch_subscriptions_updated before update on public.subscriptions
  for each row execute function public.touch_updated_at();

-- Jours de repas : à partir de p_start, p_count jours ouverts (lundi → vendredi, hors jours fermés
-- déclarés dans le calendrier des menus).
create or replace function public.subscription_dates(p_start date, p_count integer)
returns date[]
language plpgsql stable security definer set search_path = public as $$
declare
  v_day date := p_start;
  v_dates date[] := '{}';
  v_guard integer := 0;
begin
  if p_start is null or p_count is null or p_count < 1 or p_count > 60 then
    return v_dates;
  end if;
  while coalesce(array_length(v_dates, 1), 0) < p_count and v_guard < 400 loop
    if extract(isodow from v_day) <= 5
       and not exists (select 1 from public.days d where d.date = v_day and not d.is_open) then
      v_dates := v_dates || v_day;
    end if;
    v_day := v_day + 1;
    v_guard := v_guard + 1;
  end loop;
  return v_dates;
end;
$$;

-- Souscription (appelée par le site, sans compte client).
create or replace function public.create_subscription(p_plan uuid, p_start date, p_customer jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_plan record;
  v_today date := (now() at time zone 'Africa/Dakar')::date;
  v_name text := trim(coalesce(p_customer->>'name', ''));
  v_phone text := regexp_replace(coalesce(p_customer->>'phone', ''), '\D', '', 'g');
  v_address text := nullif(trim(coalesce(p_customer->>'address', '')), '');
  v_dates date[];
  v_id uuid;
begin
  select * into v_plan from public.subscription_plans where id = p_plan and active;
  if not found then raise exception 'Cette formule n''est plus disponible.'; end if;
  if length(v_name) < 2 then raise exception 'Indiquez votre nom.'; end if;
  if length(v_phone) < 7 or length(v_phone) > 15 then raise exception 'Numéro de téléphone invalide.'; end if;
  if p_start is null or p_start <= v_today then
    raise exception 'Choisissez une date de début à partir de demain.';
  end if;
  if p_start > v_today + 60 then raise exception 'Date de début trop lointaine.'; end if;

  v_dates := public.subscription_dates(p_start, v_plan.meals_count);
  if coalesce(array_length(v_dates, 1), 0) < v_plan.meals_count then
    raise exception 'Impossible de planifier les repas de cette formule.';
  end if;

  insert into public.subscriptions
    (plan_id, plan_name, meals_count, price, customer_name, phone, address, start_date, end_date)
  values
    (v_plan.id, v_plan.name, v_plan.meals_count, v_plan.price, v_name, v_phone, v_address,
     v_dates[1], v_dates[array_length(v_dates, 1)])
  returning id into v_id;

  insert into public.subscription_meals (subscription_id, meal_date)
  select v_id, d from unnest(v_dates) as d;

  return jsonb_build_object('id', v_id, 'plan_name', v_plan.name, 'price', v_plan.price,
    'start_date', v_dates[1], 'end_date', v_dates[array_length(v_dates, 1)], 'dates', to_jsonb(v_dates));
end;
$$;

-- « Mon abonnement » : abonnements d'un numéro de téléphone (sans l'adresse).
create or replace function public.lookup_subscriptions(p_phone text)
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', s.id, 'plan_name', s.plan_name, 'meals_count', s.meals_count, 'price', s.price,
    'customer_name', s.customer_name, 'start_date', s.start_date, 'end_date', s.end_date,
    'status', s.status, 'payment_status', s.payment_status,
    'meals', (select coalesce(jsonb_agg(jsonb_build_object('date', m.meal_date, 'status', m.status)
                order by m.meal_date), '[]'::jsonb)
              from public.subscription_meals m where m.subscription_id = s.id)
  ) order by s.start_date desc), '[]'::jsonb)
  from public.subscriptions s
  where s.phone = regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')
    and length(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')) >= 7
    and s.status <> 'annulee';
$$;

revoke all on function public.subscription_dates(date, integer) from public;
revoke all on function public.create_subscription(uuid, date, jsonb) from public;
revoke all on function public.lookup_subscriptions(text) from public;
grant execute on function public.subscription_dates(date, integer) to anon, authenticated, service_role;
grant execute on function public.create_subscription(uuid, date, jsonb) to anon, authenticated, service_role;
grant execute on function public.lookup_subscriptions(text) to anon, authenticated, service_role;
