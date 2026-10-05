-- Jus : format petit affiché « 250 ml », grand format à 3000 FCFA pour tous les jus,
-- ajout du Gingembre et du Corossol. (Les migrations 20261002120000/130000 sont déjà appliquées.)

-- 1. Grand format (1,5 L) à 3000 FCFA pour tous les jus
update public.product_variants v
set price = 3000
from public.products p
where p.id = v.product_id and p.category = 'jus' and v.size = 'grand';

-- 2. Nouveaux jus (petit 500 FCFA, grand 3000 FCFA ; stock de départ à ajuster dans « Produits »)
with seed(name, description, photo_url) as (
  values
    ('Gingembre', 'Gingembre frais pressé, citron et menthe, bien relevé.', '/jus/gingembre.svg'),
    ('Corossol', 'Pulpe de corossol, douce et crémeuse.', '/jus/corossol.svg')
),
inserted as (
  insert into public.products (name, description, photo_url, category, base_price, active)
  select s.name, s.description, s.photo_url, 'jus', 500, true
  from seed s
  where not exists (
    select 1 from public.products p where lower(p.name) = lower(s.name) and p.category = 'jus'
  )
  returning id
)
insert into public.product_variants (product_id, size, price, stock)
select i.id, v.size, case v.size when 'petit' then 500 else 3000 end,
       case v.size when 'petit' then 20 else 10 end
from inserted i
cross join (values ('petit'), ('grand')) as v(size)
on conflict (product_id, size) do nothing;

-- 3. Libellés des lignes de commande déjà enregistrées
update public.order_items set product_name = replace(product_name, '(25 cl)', '(250 ml)')
where variant_id is not null and product_name like '%(25 cl)%';

-- 4. place_order : libellé « 250 ml » pour le petit format
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
    else
      raise exception 'Produit introuvable.';
    end if;
  end loop;

  v_delivery_date := coalesce(v_delivery_date, v_today);
  if v_is_preorder then v_deposit := 1500; end if;

  select count(*)::int + 1 into v_seq from public.orders where created_at::date = v_now::date;
  v_ref := 'CMD-' || to_char(v_now, 'YYYYMMDD') || '-' || lpad(v_seq::text, 3, '0');

  insert into public.orders (reference, first_name, last_name, phone, address, address_extra, landmark, instructions, total,
                             order_type, deposit_required, payment_method, payment_status)
  values (v_ref, trim(p_customer->>'first_name'), trim(p_customer->>'last_name'), trim(p_customer->>'phone'),
    trim(p_customer->>'address'),
    nullif(trim(coalesce(p_customer->>'address_extra','')), ''),
    nullif(trim(coalesce(p_customer->>'landmark','')), ''),
    nullif(trim(coalesce(p_customer->>'instructions','')), ''),
    v_total, case when v_is_preorder then 'precommande' else 'immediate' end, v_deposit,
    'paydunya', 'en_attente_paiement')
  returning id into v_order_id;

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

  return jsonb_build_object('reference', v_ref, 'total', v_total, 'order_id', v_order_id,
    'order_type', case when v_is_preorder then 'precommande' else 'immediate' end, 'deposit_required', v_deposit);
end;
$function$;
