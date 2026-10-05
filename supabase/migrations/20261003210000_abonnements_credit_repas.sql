-- Abonnements : de « repas mis de côté automatiquement » à « crédit de repas utilisé en commandant ».
-- - L'abonné commande le plat de son choix sur le site ; son téléphone + son code à 4 chiffres
--   le font reconnaître et le repas (un par jour ouvré) est décompté de son abonnement.
-- - Un jour sans commande n'est pas perdu : le repas reste au crédit (la fin estimée recule).
-- - Paiement en entier ou moitié, en ligne (PayDunya) ou au téléphone ; le solde doit être réglé
--   avant le dernier repas, sinon ce repas reste bloqué. Les commandes payées restent toujours possibles.

-- 1. Abonnements : code, choix de paiement, montant encaissé
alter table public.subscriptions
  add column pin text,
  add column pin_failures integer not null default 0,
  add column payment_choice text not null default 'total' check (payment_choice in ('total', 'moitie')),
  add column payment_mode text not null default 'telephone' check (payment_mode in ('telephone', 'en_ligne')),
  add column amount_paid integer not null default 0 check (amount_paid >= 0);

alter table public.subscriptions drop constraint subscriptions_payment_status_check;
alter table public.subscriptions add constraint subscriptions_payment_status_check
  check (payment_status in ('non_paye', 'acompte', 'paye'));

update public.subscriptions
set pin = lpad((floor(random() * 10000))::int::text, 4, '0')
where pin is null;
alter table public.subscriptions alter column pin set not null;

comment on column public.subscriptions.end_date is
  'Fin estimée (si l''abonné commande chaque jour ouvré) ; recalculée à la consultation.';

-- 2. Paiements d'un abonnement (acompte, solde…), en ligne ou notés par le gérant
create table public.subscription_payments (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  amount integer not null check (amount > 0),
  method text not null check (method in ('paydunya', 'manuel')),
  status text not null default 'paye' check (status in ('en_attente', 'paye', 'echec')),
  paydunya_token text unique,
  note text,
  created_at timestamptz not null default now()
);
create index idx_subscription_payments_sub on public.subscription_payments(subscription_id);

grant select, insert, update, delete on public.subscription_payments to authenticated;
grant all on public.subscription_payments to service_role;
alter table public.subscription_payments enable row level security;
create policy "admins gèrent les paiements d'abonnement" on public.subscription_payments
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Montant encaissé et statut de paiement recalculés à chaque paiement. Un paiement en ligne réussi
-- confirme l'abonnement (au téléphone, c'est le gérant qui confirme).
create or replace function public.sync_subscription_payment()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := coalesce(new.subscription_id, old.subscription_id);
  v_paid integer;
begin
  select coalesce(sum(amount), 0) into v_paid
  from public.subscription_payments where subscription_id = v_id and status = 'paye';
  update public.subscriptions s
  set amount_paid = v_paid,
      payment_status = case when v_paid >= s.price then 'paye' when v_paid > 0 then 'acompte' else 'non_paye' end,
      status = case
        when s.status = 'en_attente' and tg_op <> 'DELETE' and new.method = 'paydunya' and new.status = 'paye'
          then 'active' else s.status end
  where s.id = v_id;
  return null;
end;
$$;
create trigger sync_subscription_payment after insert or update or delete on public.subscription_payments
  for each row execute function public.sync_subscription_payment();

-- 3. Repas : ils naissent d'une commande (plus de jours générés d'avance)
alter table public.subscription_meals
  add column order_id uuid references public.orders(id) on delete set null,
  add column created_at timestamptz not null default now();
alter table public.subscription_meals drop constraint subscription_meals_subscription_id_meal_date_key;
create unique index subscription_meals_un_par_jour on public.subscription_meals(subscription_id, meal_date)
  where status <> 'annule';
create index idx_subscription_meals_order on public.subscription_meals(order_id);
-- Les jours générés par l'ancien fonctionnement (sans commande) disparaissent : ils redeviennent du crédit.
delete from public.subscription_meals where order_id is null;

-- 4. Commandes : lien vers l'abonnement et montant pris en charge
alter table public.orders
  add column subscription_id uuid references public.subscriptions(id) on delete set null,
  add column subscription_discount integer not null default 0 check (subscription_discount >= 0);
create index idx_orders_subscription on public.orders(subscription_id);

-- Livrée → repas « pris » ; annulée → repas « annulé » (il retourne au crédit).
create or replace function public.sync_subscription_meals_from_order()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    update public.subscription_meals
    set status = case new.status when 'livree' then 'pris' when 'annulee' then 'annule' else 'prevu' end
    where order_id = new.id;
  end if;
  return null;
end;
$$;
create trigger sync_subscription_meals after update of status on public.orders
  for each row execute function public.sync_subscription_meals_from_order();

-- 5. Règles
create or replace function public.subscription_remaining(p_sub uuid)
returns integer
language sql stable security definer set search_path = public as $$
  select s.meals_count - (select count(*)::int from public.subscription_meals m
                          where m.subscription_id = s.id and m.status <> 'annule')
  from public.subscriptions s where s.id = p_sub;
$$;

-- Raison pour laquelle l'abonnement ne couvre pas un repas ce jour-là (null = couvert).
-- p_used : repas déjà décomptés dans la commande en cours.
create or replace function public.subscription_refusal(p_sub uuid, p_day date, p_used integer default 0)
returns text
language plpgsql stable security definer set search_path = public as $$
declare
  s record;
  v_remaining integer;
begin
  select * into s from public.subscriptions where id = p_sub;
  if not found or s.status = 'annulee' then return 'Cet abonnement n''est plus actif.'; end if;
  if s.status = 'en_attente' then
    return 'Votre abonnement n''est pas encore confirmé : le restaurant va vous appeler.';
  end if;
  if p_day < s.start_date then
    return 'Votre abonnement commence le ' || to_char(s.start_date, 'DD/MM') || '.';
  end if;
  if extract(isodow from p_day) > 5 then return 'L''abonnement couvre du lundi au vendredi.'; end if;
  if exists (select 1 from public.subscription_meals m
             where m.subscription_id = s.id and m.meal_date = p_day and m.status <> 'annule') then
    return 'Votre repas d''abonnement de ce jour est déjà utilisé.';
  end if;
  v_remaining := public.subscription_remaining(s.id) - p_used;
  if v_remaining <= 0 then return 'Tous les repas de votre abonnement sont utilisés.'; end if;
  if v_remaining = 1 and s.amount_paid < s.price then
    return 'Votre dernier repas sera débloqué après le règlement du solde ('
      || (s.price - s.amount_paid) || ' FCFA).';
  end if;
  return null;
end;
$$;

-- Abonnement correspondant à un téléphone + code (null si aucun). Trop d'essais faux → bloqué.
create or replace function public.subscription_by_pin(p_phone text, p_pin text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_phone text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_id uuid;
begin
  if length(v_phone) < 7 then return null; end if;
  select id into v_id from public.subscriptions
  where phone = v_phone and pin = trim(coalesce(p_pin, '')) and status <> 'annulee' and pin_failures < 5
  order by (public.subscription_remaining(id) > 0) desc, start_date
  limit 1;
  if v_id is not null then
    update public.subscriptions set pin_failures = 0 where id = v_id and pin_failures > 0;
  else
    update public.subscriptions set pin_failures = pin_failures + 1
    where phone = v_phone and status <> 'annulee';
  end if;
  return v_id;
end;
$$;

-- Fin estimée : le dernier des repas restants si l'abonné commande chaque jour ouvré.
create or replace function public.subscription_estimated_end(p_sub uuid)
returns date
language plpgsql stable security definer set search_path = public as $$
declare
  s record;
  v_remaining integer := public.subscription_remaining(p_sub);
  v_from date;
  v_dates date[];
begin
  select * into s from public.subscriptions where id = p_sub;
  if v_remaining <= 0 then
    return (select max(meal_date) from public.subscription_meals
            where subscription_id = p_sub and status <> 'annule');
  end if;
  v_from := greatest(s.start_date, (now() at time zone 'Africa/Dakar')::date + 1,
    coalesce((select max(meal_date) + 1 from public.subscription_meals
              where subscription_id = p_sub and status <> 'annule'), s.start_date));
  v_dates := public.subscription_dates(v_from, v_remaining);
  return v_dates[array_length(v_dates, 1)];
end;
$$;

-- 6. Vérification au moment de commander (appelée par le panier avant de payer)
create or replace function public.check_subscription(p_phone text, p_pin text, p_days date[])
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_phone text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_id uuid;
  s record;
  v_day date;
  v_used integer := 0;
  v_reason text;
  v_days jsonb := '[]'::jsonb;
begin
  if not exists (select 1 from public.subscriptions where phone = v_phone and status <> 'annulee') then
    return jsonb_build_object('ok', false, 'error', 'Aucun abonnement pour ce numéro.');
  end if;
  if exists (select 1 from public.subscriptions where phone = v_phone and status <> 'annulee')
     and not exists (select 1 from public.subscriptions
                     where phone = v_phone and status <> 'annulee' and pin_failures < 5) then
    return jsonb_build_object('ok', false,
      'error', 'Code bloqué après trop d''essais. Contactez le restaurant pour en recevoir un nouveau.');
  end if;
  v_id := public.subscription_by_pin(v_phone, p_pin);
  if v_id is null then return jsonb_build_object('ok', false, 'error', 'Code abonné incorrect.'); end if;

  select * into s from public.subscriptions where id = v_id;
  for v_day in select distinct d from unnest(coalesce(p_days, '{}')) as d order by d loop
    v_reason := public.subscription_refusal(v_id, v_day, v_used);
    if v_reason is null then v_used := v_used + 1; end if;
    v_days := v_days || jsonb_build_object('date', v_day, 'covered', v_reason is null, 'reason', v_reason);
  end loop;

  return jsonb_build_object('ok', true, 'plan_name', s.plan_name, 'customer_name', s.customer_name,
    'remaining', public.subscription_remaining(v_id), 'remaining_after', public.subscription_remaining(v_id) - v_used,
    'balance', greatest(s.price - s.amount_paid, 0), 'days', v_days);
end;
$$;

-- 7. Souscription : code généré, choix de paiement ; plus de jours réservés d'avance
create or replace function public.create_subscription(p_plan uuid, p_start date, p_customer jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_plan record;
  v_today date := (now() at time zone 'Africa/Dakar')::date;
  v_name text := trim(coalesce(p_customer->>'name', ''));
  v_phone text := regexp_replace(coalesce(p_customer->>'phone', ''), '\D', '', 'g');
  v_address text := nullif(trim(coalesce(p_customer->>'address', '')), '');
  v_choice text := coalesce(nullif(p_customer->>'payment_choice', ''), 'total');
  v_mode text := coalesce(nullif(p_customer->>'payment_mode', ''), 'telephone');
  v_pin text := lpad((floor(random() * 10000))::int::text, 4, '0');
  v_dates date[];
  v_id uuid;
begin
  select * into v_plan from public.subscription_plans where id = p_plan and active;
  if not found then raise exception 'Cette formule n''est plus disponible.'; end if;
  if length(v_name) < 2 then raise exception 'Indiquez votre nom.'; end if;
  if length(v_phone) < 7 or length(v_phone) > 15 then raise exception 'Numéro de téléphone invalide.'; end if;
  if v_choice not in ('total', 'moitie') or v_mode not in ('telephone', 'en_ligne') then
    raise exception 'Mode de paiement invalide.';
  end if;
  if p_start is null or p_start <= v_today then
    raise exception 'Choisissez une date de début à partir de demain.';
  end if;
  if p_start > v_today + 60 then raise exception 'Date de début trop lointaine.'; end if;

  v_dates := public.subscription_dates(p_start, v_plan.meals_count);
  if coalesce(array_length(v_dates, 1), 0) < v_plan.meals_count then
    raise exception 'Impossible de planifier les repas de cette formule.';
  end if;

  insert into public.subscriptions
    (plan_id, plan_name, meals_count, price, customer_name, phone, address, start_date, end_date,
     pin, payment_choice, payment_mode)
  values
    (v_plan.id, v_plan.name, v_plan.meals_count, v_plan.price, v_name, v_phone, v_address,
     v_dates[1], v_dates[array_length(v_dates, 1)], v_pin, v_choice, v_mode)
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'plan_name', v_plan.name, 'price', v_plan.price,
    'meals_count', v_plan.meals_count, 'pin', v_pin, 'payment_choice', v_choice, 'payment_mode', v_mode,
    'amount_due', case when v_choice = 'moitie' then ceil(v_plan.price / 2.0)::int else v_plan.price end,
    'start_date', v_dates[1], 'end_date', v_dates[array_length(v_dates, 1)], 'dates', to_jsonb(v_dates));
end;
$$;

-- 8. Suivi par téléphone : repas restants, solde, fin estimée, plat de chaque repas (sans adresse ni code)
create or replace function public.lookup_subscriptions(p_phone text)
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', s.id, 'plan_name', s.plan_name, 'meals_count', s.meals_count, 'price', s.price,
    'customer_name', s.customer_name, 'start_date', s.start_date,
    'end_date', public.subscription_estimated_end(s.id),
    'status', s.status, 'payment_status', s.payment_status, 'payment_mode', s.payment_mode,
    'amount_paid', s.amount_paid, 'remaining', public.subscription_remaining(s.id),
    'meals', (select coalesce(jsonb_agg(jsonb_build_object(
                'date', m.meal_date, 'status', m.status,
                'dish', (select string_agg(distinct oi.product_name, ', ') from public.order_items oi
                         where oi.order_id = m.order_id and oi.category = 'plat' and oi.day_date = m.meal_date))
                order by m.meal_date), '[]'::jsonb)
              from public.subscription_meals m where m.subscription_id = s.id and m.status <> 'annule')
  ) order by s.start_date desc), '[]'::jsonb)
  from public.subscriptions s
  where s.phone = regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')
    and length(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')) >= 7
    and s.status <> 'annulee';
$$;

-- 9. Commande : un plat par jour ouvré pris en charge par l'abonnement (le moins cher du jour) ;
-- le reste (autres plats, jus, jours non couverts) se paie normalement.
CREATE OR REPLACE FUNCTION public.place_order(p_customer jsonb, p_items jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  v_item jsonb; v_dp record; v_jv record; v_qty int; v_total int := 0; v_order_id uuid; v_ref text; v_seq int;
  v_now timestamp := (now() at time zone 'UTC');
  v_today date := (now() at time zone 'UTC')::date;
  v_is_preorder boolean := false; v_deposit int := 0;
  v_delivery_date date;
  v_size_label text;
  v_sub uuid; v_day record; v_used int := 0; v_discount int := 0; v_covered date[] := '{}';
  v_plat_days jsonb := '{}'::jsonb;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then raise exception 'Votre panier est vide.'; end if;
  if coalesce(trim(p_customer->>'first_name'),'') = '' or coalesce(trim(p_customer->>'last_name'),'') = ''
     or coalesce(trim(p_customer->>'phone'),'') = '' or coalesce(trim(p_customer->>'address'),'') = '' then
    raise exception 'Informations client incomplètes.';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := coalesce((v_item->>'quantity')::int, 0);
    if v_qty <= 0 or v_qty > 200 then raise exception 'Quantité invalide.'; end if;

    if v_item ? 'variant_id' then
      select v.id, v.price, v.stock, v.is_active, v.size, p.name, p.category, p.active as product_active
      into v_jv
      from public.product_variants v join public.products p on p.id = v.product_id
      where v.id = (v_item->>'variant_id')::uuid for update of v;
      if not found or v_jv.category <> 'jus' then raise exception 'Produit introuvable.'; end if;
      if not v_jv.is_active or not v_jv.product_active then raise exception '% n''est plus disponible.', v_jv.name; end if;
      if v_jv.stock < v_qty then
        raise exception 'Désolé, % (%) : il ne reste que % bouteille(s).', v_jv.name,
          case v_jv.size when 'grand' then '1,5 L' else '250 ml' end, greatest(v_jv.stock, 0);
      end if;
      v_total := v_total + v_qty * v_jv.price;
    elsif v_item ? 'day_product_id' then
      select dp.id, dp.price, dp.stock_initial, dp.stock_reserved, dp.is_active,
             d.date as day_date, d.is_open, w.status as week_status,
             coalesce(dp.close_time, d.close_time) as close_time,
             p.name, p.category, p.active as product_active
      into v_dp
      from public.day_products dp join public.days d on d.id = dp.day_id
      join public.weeks w on w.id = d.week_id join public.products p on p.id = dp.product_id
      where dp.id = (v_item->>'day_product_id')::uuid for update of dp;
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
      if v_dp.day_date > v_today then v_is_preorder := true; end if;
      if v_delivery_date is null or v_dp.day_date < v_delivery_date then v_delivery_date := v_dp.day_date; end if;
      v_total := v_total + v_qty * v_dp.price;
      if v_dp.category = 'plat' and (not v_plat_days ? v_dp.day_date::text
          or (v_plat_days->>v_dp.day_date::text)::int > v_dp.price) then
        v_plat_days := v_plat_days || jsonb_build_object(v_dp.day_date::text, v_dp.price);
      end if;
    else
      raise exception 'Produit introuvable.';
    end if;
  end loop;

  -- Abonnement : téléphone + code
  if coalesce(trim(p_customer->>'subscription_pin'), '') <> '' then
    v_sub := public.subscription_by_pin(p_customer->>'phone', p_customer->>'subscription_pin');
    if v_sub is null then raise exception 'Code abonné incorrect.'; end if;
    for v_day in select key::date as day, value::int as price from jsonb_each_text(v_plat_days) order by key loop
      if public.subscription_refusal(v_sub, v_day.day, v_used) is null then
        v_used := v_used + 1;
        v_discount := v_discount + v_day.price;
        v_covered := v_covered || v_day.day;
      end if;
    end loop;
    if v_used = 0 then v_sub := null; end if;
  end if;

  v_delivery_date := coalesce(v_delivery_date, v_today);
  if v_is_preorder and v_total - v_discount > 0 then v_deposit := least(1500, v_total - v_discount); end if;

  select count(*)::int + 1 into v_seq from public.orders where created_at::date = v_now::date;
  v_ref := 'CMD-' || to_char(v_now, 'YYYYMMDD') || '-' || lpad(v_seq::text, 3, '0');

  insert into public.orders (reference, first_name, last_name, phone, address, address_extra, landmark, instructions, total,
                             order_type, deposit_required, payment_method, payment_status,
                             subscription_id, subscription_discount)
  values (v_ref, trim(p_customer->>'first_name'), trim(p_customer->>'last_name'), trim(p_customer->>'phone'),
    trim(p_customer->>'address'),
    nullif(trim(coalesce(p_customer->>'address_extra','')), ''),
    nullif(trim(coalesce(p_customer->>'landmark','')), ''),
    nullif(trim(coalesce(p_customer->>'instructions','')), ''),
    v_total - v_discount, case when v_is_preorder then 'precommande' else 'immediate' end, v_deposit,
    case when v_total - v_discount = 0 then 'abonnement' else 'paydunya' end,
    case when v_total - v_discount = 0 then 'abonnement' else 'en_attente_paiement' end,
    v_sub, v_discount)
  returning id into v_order_id;

  if v_sub is not null then
    insert into public.subscription_meals (subscription_id, meal_date, order_id)
    select v_sub, d, v_order_id from unnest(v_covered) as d;
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := (v_item->>'quantity')::int;
    if v_item ? 'variant_id' then
      select v.id, v.price, v.size, p.name, p.category into v_jv
      from public.product_variants v join public.products p on p.id = v.product_id
      where v.id = (v_item->>'variant_id')::uuid;
      v_size_label := case v_jv.size when 'grand' then '1,5 L' else '250 ml' end;
      update public.product_variants set stock = stock - v_qty where id = v_jv.id;
      insert into public.order_items (order_id, variant_id, size, day_date, product_name, category, quantity, unit_price, amount)
      values (v_order_id, v_jv.id, v_jv.size, v_delivery_date, v_jv.name || ' (' || v_size_label || ')', v_jv.category,
              v_qty, v_jv.price, v_qty * v_jv.price);
    else
      select dp.id, dp.price, d.date as day_date, p.name, p.category into v_dp
      from public.day_products dp join public.days d on d.id = dp.day_id join public.products p on p.id = dp.product_id
      where dp.id = (v_item->>'day_product_id')::uuid;
      update public.day_products set stock_reserved = stock_reserved + v_qty where id = v_dp.id;
      insert into public.order_items (order_id, day_product_id, day_date, product_name, category, quantity, unit_price, amount)
      values (v_order_id, v_dp.id, v_dp.day_date, v_dp.name, v_dp.category, v_qty, v_dp.price, v_qty * v_dp.price);
    end if;
  end loop;

  return jsonb_build_object('reference', v_ref, 'total', v_total - v_discount, 'order_id', v_order_id,
    'order_type', case when v_is_preorder then 'precommande' else 'immediate' end, 'deposit_required', v_deposit,
    'subscription', case when v_sub is null then null else jsonb_build_object(
      'covered_days', to_jsonb(v_covered), 'discount', v_discount,
      'remaining', public.subscription_remaining(v_sub)) end);
end;
$function$;

-- 10. Droits
revoke all on function public.sync_subscription_payment() from public;
revoke all on function public.sync_subscription_meals_from_order() from public;
revoke all on function public.subscription_remaining(uuid) from public;
revoke all on function public.subscription_refusal(uuid, date, integer) from public;
revoke all on function public.subscription_by_pin(text, text) from public;
revoke all on function public.subscription_estimated_end(uuid) from public;
revoke all on function public.check_subscription(text, text, date[]) from public;
grant execute on function public.subscription_remaining(uuid) to authenticated, service_role;
grant execute on function public.subscription_estimated_end(uuid) to authenticated, service_role;
grant execute on function public.check_subscription(text, text, date[]) to anon, authenticated, service_role;
