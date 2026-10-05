ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS order_type text NOT NULL DEFAULT 'immediate',
  ADD COLUMN IF NOT EXISTS deposit_required integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.place_order(p_customer jsonb, p_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_item jsonb;
  v_dp record;
  v_qty int;
  v_total int := 0;
  v_order_id uuid;
  v_ref text;
  v_seq int;
  v_now timestamp := (now() at time zone 'UTC');
  v_today date := (now() at time zone 'UTC')::date;
  v_is_preorder boolean := false;
  v_deposit int := 0;
  v_method text := nullif(trim(coalesce(p_customer->>'payment_method','')), '');
  v_payref text := nullif(trim(coalesce(p_customer->>'payment_reference','')), '');
  v_pay_status text := 'non_paye';
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

    if v_dp.day_date > v_today then
      v_is_preorder := true;
    end if;

    v_total := v_total + v_qty * v_dp.price;
  end loop;

  if v_is_preorder then
    v_deposit := 1500;
    if v_method is null or v_method not in ('wave','orange_money') then
      raise exception 'Choisissez un moyen de paiement (Wave ou Orange Money) pour votre précommande.';
    end if;
    if v_payref is null then
      raise exception 'Renseignez l''identifiant de la transaction de votre acompte de 1500 FCFA.';
    end if;
    v_pay_status := 'acompte_a_verifier';
  end if;

  select count(*)::int + 1 into v_seq from public.orders where created_at::date = v_now::date;
  v_ref := 'CMD-' || to_char(v_now, 'YYYYMMDD') || '-' || lpad(v_seq::text, 3, '0');

  insert into public.orders (reference, first_name, last_name, phone, address, address_extra, landmark, instructions, total,
                             order_type, deposit_required, payment_method, payment_reference, payment_status)
  values (
    v_ref,
    trim(p_customer->>'first_name'),
    trim(p_customer->>'last_name'),
    trim(p_customer->>'phone'),
    trim(p_customer->>'address'),
    nullif(trim(coalesce(p_customer->>'address_extra','')), ''),
    nullif(trim(coalesce(p_customer->>'landmark','')), ''),
    nullif(trim(coalesce(p_customer->>'instructions','')), ''),
    v_total,
    case when v_is_preorder then 'precommande' else 'immediate' end,
    v_deposit,
    v_method,
    v_payref,
    v_pay_status
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

  return jsonb_build_object('reference', v_ref, 'total', v_total, 'order_id', v_order_id,
                            'order_type', case when v_is_preorder then 'precommande' else 'immediate' end,
                            'deposit_required', v_deposit);
end;
$function$;