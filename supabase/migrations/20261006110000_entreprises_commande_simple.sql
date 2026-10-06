-- Commande entreprise simplifiée : entreprise + nom + téléphone (sans code).
-- Réglage par entreprise : open_enrollment = tout employé peut commander (ajouté automatiquement à la
-- liste) ; sinon seuls les numéros de la liste des employés sont acceptés.
alter table public.partners add column open_enrollment boolean not null default false;
comment on column public.partners.open_enrollment is
  'true : tout employé qui donne son nom et son téléphone peut commander (ajouté à la liste) ; false : liste des employés uniquement.';

-- Cœur commun (vérifications des plats, stock, heure limite, création de la commande).
create or replace function public._place_partner_order_core(p_partner uuid, p_employee uuid, p_items jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_partner record; v_emp record; v_item jsonb; v_dp record; v_jv record; v_qty int;
  v_total int := 0; v_order_id uuid; v_ref text; v_seq int;
  v_now timestamp := (now() at time zone 'Africa/Dakar');
  v_first_day date; v_deadline timestamp; v_size_label text;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then raise exception 'Votre panier est vide.'; end if;
  select * into v_partner from public.partners where id = p_partner and active;
  if not found then raise exception 'Entreprise introuvable.'; end if;
  select * into v_emp from public.partner_employees where id = p_employee and partner_id = p_partner;
  if not found then raise exception 'Employé introuvable.'; end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := coalesce((v_item->>'quantity')::int, 0);
    if v_qty <= 0 or v_qty > 50 then raise exception 'Quantité invalide.'; end if;
    if v_item ? 'variant_id' then
      select v.id, v.price, v.stock, v.is_active, v.size, p.name, p.category, p.active as product_active
      into v_jv from public.product_variants v join public.products p on p.id = v.product_id
      where v.id = (v_item->>'variant_id')::uuid for update of v;
      if not found or v_jv.category <> 'jus' then raise exception 'Produit introuvable.'; end if;
      if not v_jv.is_active or not v_jv.product_active then raise exception '% n''est plus disponible.', v_jv.name; end if;
      if v_jv.stock < v_qty then raise exception 'Désolé, % : il ne reste que % bouteille(s).', v_jv.name, greatest(v_jv.stock, 0); end if;
      v_total := v_total + v_qty * v_jv.price;
    elsif v_item ? 'day_product_id' then
      select dp.id, dp.price, dp.stock_initial, dp.stock_reserved, dp.is_active, d.date as day_date, d.is_open,
             w.status as week_status, p.name, p.active as product_active
      into v_dp from public.day_products dp join public.days d on d.id = dp.day_id
      join public.weeks w on w.id = d.week_id join public.products p on p.id = dp.product_id
      where dp.id = (v_item->>'day_product_id')::uuid for update of dp;
      if not found then raise exception 'Produit introuvable.'; end if;
      if v_dp.week_status <> 'published' then raise exception 'Ce menu n''est pas disponible.'; end if;
      if not v_dp.is_active or not v_dp.product_active then raise exception '% n''est plus disponible.', v_dp.name; end if;
      if not v_dp.is_open then raise exception 'Pas de livraison le %.', to_char(v_dp.day_date, 'DD/MM'); end if;
      v_deadline := (v_dp.day_date - v_partner.cutoff_day_offset) + v_partner.cutoff_time;
      if v_now >= v_deadline then
        raise exception 'Les commandes pour le % sont closes depuis % : commandez pour le jour suivant.',
          to_char(v_dp.day_date, 'DD/MM'), to_char(v_deadline, 'DD/MM à HH24"h"MI');
      end if;
      if v_dp.stock_initial - v_dp.stock_reserved < v_qty then
        raise exception 'Désolé, % : il ne reste que % portion(s).', v_dp.name, greatest(v_dp.stock_initial - v_dp.stock_reserved, 0);
      end if;
      if v_first_day is null or v_dp.day_date < v_first_day then v_first_day := v_dp.day_date; end if;
      v_total := v_total + v_qty * v_dp.price;
    else
      raise exception 'Produit introuvable.';
    end if;
  end loop;
  if v_first_day is null then raise exception 'Choisissez au moins un plat du menu.'; end if;

  perform pg_advisory_xact_lock(hashtext('orders.reference'));
  select count(*)::int + 1 into v_seq from public.orders where created_at::date = v_now::date;
  v_ref := 'CMD-' || to_char(v_now, 'YYYYMMDD') || '-' || lpad(v_seq::text, 3, '0');

  insert into public.orders (reference, first_name, last_name, phone, address, instructions, total,
    order_type, deposit_required, payment_method, payment_status, partner_id, partner_employee_id)
  values (v_ref, v_emp.full_name, v_partner.name, v_emp.phone,
    coalesce(v_partner.delivery_address, v_partner.name), 'Livraison entreprise : ' || v_partner.name, v_total,
    'precommande', 0, 'entreprise', 'facture_entreprise', v_partner.id, v_emp.id)
  returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := (v_item->>'quantity')::int;
    if v_item ? 'variant_id' then
      select v.id, v.price, v.size, p.name, p.category into v_jv
      from public.product_variants v join public.products p on p.id = v.product_id where v.id = (v_item->>'variant_id')::uuid;
      v_size_label := case v_jv.size when 'grand' then '1,5 L' else '250 ml' end;
      update public.product_variants set stock = stock - v_qty where id = v_jv.id;
      insert into public.order_items (order_id, variant_id, size, day_date, product_name, category, quantity, unit_price, amount)
      values (v_order_id, v_jv.id, v_jv.size, v_first_day, v_jv.name || ' (' || v_size_label || ')', v_jv.category, v_qty, v_jv.price, v_qty * v_jv.price);
    else
      select dp.id, dp.price, d.date as day_date, p.name, p.category into v_dp
      from public.day_products dp join public.days d on d.id = dp.day_id join public.products p on p.id = dp.product_id
      where dp.id = (v_item->>'day_product_id')::uuid;
      update public.day_products set stock_reserved = stock_reserved + v_qty where id = v_dp.id;
      insert into public.order_items (order_id, day_product_id, day_date, product_name, category, quantity, unit_price, amount)
      values (v_order_id, v_dp.id, v_dp.day_date, v_dp.name, v_dp.category, v_qty, v_dp.price, v_qty * v_dp.price);
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'reference', v_ref, 'total', v_total, 'order_id', v_order_id,
    'partner', v_partner.name, 'employee', v_emp.full_name);
end;
$$;
revoke all on function public._place_partner_order_core(uuid, uuid, jsonb) from public, anon, authenticated;

-- Ancienne commande avec code (gardée pour compatibilité) : vérifie le code puis le cœur commun.
create or replace function public.place_partner_order(p_partner uuid, p_phone text, p_pin text, p_items jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_auth record;
begin
  select * into v_auth from public._partner_employee_auth(p_partner, p_phone, p_pin);
  if v_auth.err is not null then return jsonb_build_object('ok', false, 'error', v_auth.err); end if;
  return public._place_partner_order_core(p_partner, v_auth.emp_id, p_items);
end;
$$;

-- Nouvelle commande : entreprise + nom + téléphone.
create or replace function public.place_partner_order_simple(p_partner uuid, p_full_name text, p_phone text, p_items jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_partner record; v_emp_id uuid; v_emp_active boolean;
  v_phone text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_name text := btrim(coalesce(p_full_name, ''));
begin
  if length(v_name) < 2 then raise exception 'Indiquez votre nom.'; end if;
  if length(v_phone) < 7 then raise exception 'Numéro de téléphone invalide.'; end if;
  select * into v_partner from public.partners where id = p_partner and active;
  if not found then raise exception 'Entreprise introuvable.'; end if;

  select id, active into v_emp_id, v_emp_active from public.partner_employees
  where partner_id = p_partner and phone = v_phone;
  if v_emp_id is not null and not v_emp_active then
    raise exception 'Ce numéro est désactivé pour %. Contactez votre responsable.', v_partner.name;
  end if;
  if v_emp_id is null then
    if not v_partner.open_enrollment then
      raise exception 'Ce numéro n''est pas sur la liste des employés de %. Contactez votre responsable.', v_partner.name;
    end if;
    insert into public.partner_employees (partner_id, full_name, phone, email)
    values (p_partner, v_name, v_phone, '')
    returning id into v_emp_id;
  end if;
  return public._place_partner_order_core(p_partner, v_emp_id, p_items);
end;
$$;
revoke all on function public.place_partner_order_simple(uuid, text, text, jsonb) from public;
grant execute on function public.place_partner_order_simple(uuid, text, text, jsonb) to anon, authenticated;
