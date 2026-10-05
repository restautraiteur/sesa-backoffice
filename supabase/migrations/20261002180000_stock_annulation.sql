-- Annulation d'une commande : les portions (plats du menu) et les bouteilles (jus) reviennent en stock.
-- Si le gérant revient sur l'annulation, elles sont de nouveau retirées du stock.

create or replace function public.restock_on_order_cancel()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_sign int;
begin
  if new.status = old.status then
    return new;
  end if;

  if new.status = 'annulee' then
    v_sign := 1;   -- remise en stock
  elsif old.status = 'annulee' then
    v_sign := -1;  -- annulation annulée : on retire à nouveau
  else
    return new;
  end if;

  -- Plats du menu : on libère (ou reprend) les portions réservées
  update public.day_products dp
  set stock_reserved = greatest(dp.stock_reserved - v_sign * oi.qty, 0)
  from (
    select day_product_id, sum(quantity)::int as qty
    from public.order_items
    where order_id = new.id and day_product_id is not null
    group by day_product_id
  ) oi
  where dp.id = oi.day_product_id;

  -- Jus du catalogue : on remet (ou retire) les bouteilles
  update public.product_variants pv
  set stock = greatest(pv.stock + v_sign * oi.qty, 0)
  from (
    select variant_id, sum(quantity)::int as qty
    from public.order_items
    where order_id = new.id and variant_id is not null
    group by variant_id
  ) oi
  where pv.id = oi.variant_id;

  return new;
end;
$$;

drop trigger if exists restock_on_order_cancel on public.orders;
create trigger restock_on_order_cancel
  after update of status on public.orders
  for each row execute function public.restock_on_order_cancel();
