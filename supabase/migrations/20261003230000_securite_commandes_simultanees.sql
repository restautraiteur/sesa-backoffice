-- Sécurité et commandes simultanées.
-- 1. Les fonctions internes des abonnements ne sont plus appelables par les visiteurs (Supabase leur
--    donne le droit d'exécution par défaut : « revoke from public » ne suffisait pas).
-- 2. place_order : verrou sur l'abonnement (un repas ne peut pas être utilisé deux fois par deux
--    commandes simultanées) et sur le calcul du numéro de commande (plus de doublon CMD-…-00X).

revoke execute on function public.subscription_by_pin(text, text) from anon, authenticated;
revoke execute on function public.subscription_refusal(uuid, date, integer) from anon, authenticated;
revoke execute on function public.subscription_remaining(uuid) from anon;
revoke execute on function public.subscription_estimated_end(uuid) from anon;
revoke execute on function public.sync_subscription_payment() from anon, authenticated;
revoke execute on function public.sync_subscription_meals_from_order() from anon, authenticated;

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
    -- Deux commandes simultanées du même abonné passent l'une après l'autre (pas de repas utilisé deux fois).
    perform 1 from public.subscriptions where id = v_sub for update;
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

  -- Numéro de commande : un seul calcul à la fois, sinon deux commandes simultanées auraient le même.
  perform pg_advisory_xact_lock(hashtext('orders.reference'));
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
