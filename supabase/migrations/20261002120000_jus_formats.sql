-- Jus : catalogue permanent (hors planning de la semaine), deux formats par jus
-- (petit = 25 cl, grand = 1,5 L) avec chacun son prix et son stock.

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  size text not null check (size in ('petit', 'grand')),
  price integer not null default 0 check (price >= 0),
  stock integer not null default 0 check (stock >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, size)
);

grant select on public.product_variants to anon;
grant select, insert, update, delete on public.product_variants to authenticated;
grant all on public.product_variants to service_role;
alter table public.product_variants enable row level security;
create policy "product_variants public" on public.product_variants for select to anon using (true);
create policy "product_variants auth read" on public.product_variants for select to authenticated using (true);
create policy "admins manage product_variants" on public.product_variants for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create trigger touch_product_variants_updated before update on public.product_variants
  for each row execute function public.touch_updated_at();

create index idx_product_variants_product on public.product_variants(product_id);

-- Lignes de commande : référence au format de jus commandé
alter table public.order_items
  add column if not exists variant_id uuid references public.product_variants(id) on delete set null,
  add column if not exists size text;

-- Catalogue public des jus
create view public.juice_catalog_view with (security_invoker = on) as
select
  v.id as variant_id,
  p.id as product_id,
  p.name,
  p.description,
  p.photo_url,
  v.size,
  v.price,
  v.stock,
  case
    when not v.is_active or not p.active then 'desactive'
    when v.stock <= 0 then 'epuise'
    else 'disponible'
  end as state
from public.product_variants v
join public.products p on p.id = v.product_id
where p.category = 'jus';

grant select on public.juice_catalog_view to anon, authenticated;
grant all on public.juice_catalog_view to service_role;

-- PLACE ORDER : accepte des plats du menu ({day_product_id}) et des jus du catalogue ({variant_id}).
-- Les jus sont livrés avec le premier jour de plats de la commande (ou aujourd'hui s'il n'y a que des jus).
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
          case v_jv.size when 'grand' then '1,5 L' else '25 cl' end, greatest(v_jv.stock, 0);
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
      v_size_label := case v_jv.size when 'grand' then '1,5 L' else '25 cl' end;
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
