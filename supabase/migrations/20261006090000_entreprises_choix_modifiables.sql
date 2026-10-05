-- Employés des entreprises partenaires : consulter leurs plats commandés (« Mes repas ») et changer
-- de plat ou annuler un jour, jusqu'à l'heure limite de leur entreprise. Après : jour clos.

-- Vérifie entreprise + téléphone + code. Erreur de code : compte l'essai (pas d'exception, pour
-- que le compteur soit bien enregistré) et renvoie err.
create or replace function public._partner_employee_auth(p_partner uuid, p_phone text, p_pin text,
  out emp_id uuid, out err text)
language plpgsql security definer set search_path = public as $$
declare
  v_partner record; v_emp record;
  v_phone text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
begin
  select * into v_partner from public.partners where id = p_partner and active;
  if not found then err := 'Entreprise introuvable.'; return; end if;
  select * into v_emp from public.partner_employees
  where partner_id = p_partner and phone = v_phone and active for update;
  if not found then
    err := format('Ce numéro n''est pas enregistré pour %s. Contactez votre responsable.', v_partner.name);
    return;
  end if;
  if v_emp.pin_failures >= 5 then
    err := 'Code bloqué après trop d''essais. Contactez le restaurant pour en recevoir un nouveau.';
    return;
  end if;
  if v_emp.pin <> trim(coalesce(p_pin, '')) then
    update public.partner_employees set pin_failures = pin_failures + 1 where id = v_emp.id;
    err := 'Code incorrect.';
    return;
  end if;
  update public.partner_employees set pin_failures = 0 where id = v_emp.id and pin_failures > 0;
  emp_id := v_emp.id;
end;
$$;
revoke all on function public._partner_employee_auth(uuid, text, text) from public, anon, authenticated;

-- Plats à venir de l'employé, avec l'heure limite et les plats possibles ce jour-là.
create or replace function public.partner_my_choices(p_partner uuid, p_phone text, p_pin text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_auth record; v_partner record; v_emp record; v_items jsonb;
  v_now timestamp := (now() at time zone 'Africa/Dakar');
begin
  select * into v_auth from public._partner_employee_auth(p_partner, p_phone, p_pin);
  if v_auth.err is not null then return jsonb_build_object('ok', false, 'error', v_auth.err); end if;
  select * into v_partner from public.partners where id = p_partner;
  select * into v_emp from public.partner_employees where id = v_auth.emp_id;

  select coalesce(jsonb_agg(x order by x->>'day_date', x->>'product_name'), '[]'::jsonb) into v_items
  from (
    select jsonb_build_object(
      'item_id', oi.id,
      'reference', o.reference,
      'day_date', oi.day_date,
      'day_product_id', oi.day_product_id,
      'product_name', oi.product_name,
      'quantity', oi.quantity,
      'amount', oi.amount,
      'deadline', to_char((oi.day_date - v_partner.cutoff_day_offset) + v_partner.cutoff_time, 'YYYY-MM-DD"T"HH24:MI'),
      'editable', v_now < (oi.day_date - v_partner.cutoff_day_offset) + v_partner.cutoff_time,
      'options', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'day_product_id', dp.id, 'name', p.name, 'price', dp.price,
          'remaining', dp.stock_initial - dp.stock_reserved) order by p.name), '[]'::jsonb)
        from public.day_products dp
        join public.days d on d.id = dp.day_id
        join public.weeks w on w.id = d.week_id
        join public.products p on p.id = dp.product_id
        where d.date = oi.day_date and d.is_open and w.status = 'published'
          and dp.is_active and p.active and p.category <> 'jus'
      )
    ) as x
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where o.partner_employee_id = v_emp.id and o.status <> 'annulee'
      and oi.day_product_id is not null
      and oi.day_date >= v_now::date
  ) s;

  return jsonb_build_object('ok', true, 'employee', v_emp.full_name, 'partner', v_partner.name,
    'items', v_items);
end;
$$;

-- Change le plat d'un jour (p_day_product = nouveau plat du même jour) ou l'annule (null).
create or replace function public.partner_change_choice(p_partner uuid, p_phone text, p_pin text,
  p_item uuid, p_day_product uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_auth record; v_partner record; v_item record; v_dp record; v_deadline timestamp;
  v_now timestamp := (now() at time zone 'Africa/Dakar');
begin
  select * into v_auth from public._partner_employee_auth(p_partner, p_phone, p_pin);
  if v_auth.err is not null then return jsonb_build_object('ok', false, 'error', v_auth.err); end if;
  select * into v_partner from public.partners where id = p_partner;

  select oi.*, o.status as order_status into v_item
  from public.order_items oi join public.orders o on o.id = oi.order_id
  where oi.id = p_item and o.partner_employee_id = v_auth.emp_id and o.partner_id = p_partner
  for update of oi, o;
  if not found or v_item.order_status = 'annulee' or v_item.day_product_id is null then
    raise exception 'Repas introuvable.';
  end if;

  v_deadline := (v_item.day_date - v_partner.cutoff_day_offset) + v_partner.cutoff_time;
  if v_now >= v_deadline then
    raise exception 'Le repas du % est clos depuis % : il ne peut plus être modifié.',
      to_char(v_item.day_date, 'DD/MM'), to_char(v_deadline, 'DD/MM à HH24"h"MI');
  end if;

  if p_day_product is not null and p_day_product = v_item.day_product_id then
    return jsonb_build_object('ok', true, 'unchanged', true);
  end if;

  -- Libère la portion de l'ancien plat.
  update public.day_products set stock_reserved = greatest(stock_reserved - v_item.quantity, 0)
  where id = v_item.day_product_id;

  if p_day_product is null then
    delete from public.order_items where id = p_item;
  else
    select dp.id, dp.price, dp.stock_initial, dp.stock_reserved, dp.is_active, d.date as day_date, d.is_open,
           w.status as week_status, p.name, p.category, p.active as product_active
    into v_dp from public.day_products dp join public.days d on d.id = dp.day_id
    join public.weeks w on w.id = d.week_id join public.products p on p.id = dp.product_id
    where dp.id = p_day_product for update of dp;
    if not found or v_dp.day_date <> v_item.day_date or v_dp.week_status <> 'published'
       or not v_dp.is_active or not v_dp.product_active or not v_dp.is_open or v_dp.category = 'jus' then
      raise exception 'Ce plat n''est pas proposé ce jour-là.';
    end if;
    if v_dp.stock_initial - v_dp.stock_reserved < v_item.quantity then
      raise exception 'Désolé, % : il ne reste que % portion(s).', v_dp.name,
        greatest(v_dp.stock_initial - v_dp.stock_reserved, 0);
    end if;
    update public.day_products set stock_reserved = stock_reserved + v_item.quantity where id = v_dp.id;
    update public.order_items
    set day_product_id = v_dp.id, product_name = v_dp.name, category = v_dp.category,
        unit_price = v_dp.price, amount = v_item.quantity * v_dp.price
    where id = p_item;
  end if;

  -- Total de la commande recalculé ; commande annulée s'il n'y reste plus rien.
  update public.orders o
  set total = coalesce((select sum(amount) from public.order_items where order_id = o.id), 0),
      status = case when exists (select 1 from public.order_items where order_id = o.id) then o.status else 'annulee' end
  where o.id = v_item.order_id;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.partner_my_choices(uuid, text, text) from public;
revoke all on function public.partner_change_choice(uuid, text, text, uuid, uuid) from public;
grant execute on function public.partner_my_choices(uuid, text, text) to anon, authenticated;
grant execute on function public.partner_change_choice(uuid, text, text, uuid, uuid) to anon, authenticated;
