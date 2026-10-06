-- Traçabilité des repas : combien de repas chaque personne (employé d'entreprise ou particulier) a pris,
-- quand, sur un mois ou une année, et par entreprise. Calculs côté base (pas de limite de 1 000 lignes).
-- security invoker : la sécurité (RLS) s'applique, seul le gérant voit les commandes.
-- Personne : l'employé (partner_employee_id) ou, pour un particulier, son téléphone (« tel:… »).
-- Repas = portions de plats ; commandes annulées ou en attente de paiement exclues.

create or replace function public.meal_stats_by_person(
  p_from date, p_to date, p_partner uuid default null, p_scope text default 'all')
returns table (
  person_key text, partner_id uuid, partner_name text, employee_id uuid, person_name text,
  phone text, meals bigint, amount bigint, days bigint, first_day date, last_day date)
language sql stable security invoker set search_path = public as $$
  select
    coalesce(o.partner_employee_id::text, 'tel:' || o.phone) as person_key,
    o.partner_id,
    max(p.name) as partner_name,
    o.partner_employee_id as employee_id,
    coalesce(max(e.full_name),
             max(btrim(o.first_name || ' ' || coalesce(o.last_name, '')))) as person_name,
    max(o.phone) as phone,
    coalesce(sum(oi.quantity) filter (where oi.category = 'plat'), 0) as meals,
    coalesce(sum(oi.amount), 0) as amount,
    count(distinct oi.day_date) filter (where oi.category = 'plat') as days,
    min(oi.day_date) as first_day,
    max(oi.day_date) as last_day
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  left join public.partners p on p.id = o.partner_id
  left join public.partner_employees e on e.id = o.partner_employee_id
  where o.status not in ('annulee', 'en_attente_paiement')
    and oi.day_date between p_from and p_to
    and (p_partner is null or o.partner_id = p_partner)
    and (p_scope = 'all'
         or (p_scope = 'entreprises' and o.partner_id is not null)
         or (p_scope = 'particuliers' and o.partner_id is null))
  group by 1, o.partner_id, o.partner_employee_id
  order by meals desc, person_name;
$$;

-- Repas par mois d'une année (pour tout le monde, une entreprise ou une personne).
create or replace function public.meal_stats_by_month(
  p_year integer, p_partner uuid default null, p_person text default null, p_scope text default 'all')
returns table (month integer, meals bigint, amount bigint, people bigint)
language sql stable security invoker set search_path = public as $$
  select
    extract(month from oi.day_date)::int as month,
    coalesce(sum(oi.quantity) filter (where oi.category = 'plat'), 0) as meals,
    coalesce(sum(oi.amount), 0) as amount,
    count(distinct coalesce(o.partner_employee_id::text, 'tel:' || o.phone)) as people
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where o.status not in ('annulee', 'en_attente_paiement')
    and oi.day_date >= make_date(p_year, 1, 1) and oi.day_date < make_date(p_year + 1, 1, 1)
    and (p_partner is null or o.partner_id = p_partner)
    and (p_person is null or coalesce(o.partner_employee_id::text, 'tel:' || o.phone) = p_person)
    and (p_scope = 'all'
         or (p_scope = 'entreprises' and o.partner_id is not null)
         or (p_scope = 'particuliers' and o.partner_id is null))
  group by 1
  order by 1;
$$;

-- Historique détaillé d'une personne : chaque repas, avec la date et le plat.
create or replace function public.meal_history(p_person text, p_from date, p_to date)
returns table (
  day_date date, product_name text, category text, quantity integer, amount integer,
  reference text, partner_name text, order_status text)
language sql stable security invoker set search_path = public as $$
  select oi.day_date, oi.product_name, oi.category, oi.quantity, oi.amount,
         o.reference, p.name, o.status
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  left join public.partners p on p.id = o.partner_id
  where coalesce(o.partner_employee_id::text, 'tel:' || o.phone) = p_person
    and o.status not in ('annulee', 'en_attente_paiement')
    and oi.day_date between p_from and p_to
  order by oi.day_date desc, oi.product_name;
$$;

revoke all on function public.meal_stats_by_person(date, date, uuid, text) from public, anon;
revoke all on function public.meal_stats_by_month(integer, uuid, text, text) from public, anon;
revoke all on function public.meal_history(text, date, date) from public, anon;
grant execute on function public.meal_stats_by_person(date, date, uuid, text) to authenticated;
grant execute on function public.meal_stats_by_month(integer, uuid, text, text) to authenticated;
grant execute on function public.meal_history(text, date, date) to authenticated;

-- Index utiles aux calculs par période.
create index if not exists idx_order_items_day_date on public.order_items(day_date);
create index if not exists idx_orders_partner_employee on public.orders(partner_employee_id);
