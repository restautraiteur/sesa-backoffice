-- Entreprises partenaires (module générique, activé par client dans src/config/client.ts).
-- Les employés enrôlés commandent à l'avance sans payer : l'entreprise paie tout. Chaque jour de
-- livraison donne un bon de commande par entreprise ; à la fin du mois, les bons sont regroupés en facture.
-- Pas de compte employé : au panier, l'employé choisit son entreprise et saisit téléphone + code.

create table public.partners (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_name text,
  contact_phone text,
  contact_email text,
  delivery_address text,
  delivery_time time not null default '13:00',
  -- Heure limite : commandes pour le jour J acceptées jusqu'à (J - cutoff_day_offset) à cutoff_time.
  -- Par défaut : 6 h le matin du jour de livraison.
  cutoff_time time not null default '06:00',
  cutoff_day_offset integer not null default 0 check (cutoff_day_offset between 0 and 7),
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.partner_employees (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete cascade,
  full_name text not null,
  phone text not null,                       -- chiffres uniquement
  email text not null,
  pin text not null default lpad((floor(random() * 10000))::int::text, 4, '0'),
  pin_failures integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (partner_id, phone)
);
create index idx_partner_employees_partner on public.partner_employees(partner_id);

-- Bon de commande d'un jour (créé quand le gérant le prépare ou le marque livré).
create table public.partner_delivery_notes (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete cascade,
  delivery_date date not null,
  status text not null default 'a_livrer' check (status in ('a_livrer', 'livre')),
  signed_by text,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  unique (partner_id, delivery_date)
);

-- Facture du mois (regroupe les bons du mois).
create table public.partner_invoices (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete cascade,
  month date not null,                        -- premier jour du mois
  reference text not null,
  total integer not null default 0 check (total >= 0),
  status text not null default 'envoyee' check (status in ('envoyee', 'payee')),
  sent_at timestamptz not null default now(),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  unique (partner_id, month)
);

alter table public.orders
  add column partner_id uuid references public.partners(id) on delete set null,
  add column partner_employee_id uuid references public.partner_employees(id) on delete set null;
create index idx_orders_partner on public.orders(partner_id);

-- Droits : réservé au gérant (accès des employés uniquement par fonctions)
grant select, insert, update, delete on public.partners, public.partner_employees,
  public.partner_delivery_notes, public.partner_invoices to authenticated;
grant all on public.partners, public.partner_employees, public.partner_delivery_notes,
  public.partner_invoices to service_role;
alter table public.partners enable row level security;
alter table public.partner_employees enable row level security;
alter table public.partner_delivery_notes enable row level security;
alter table public.partner_invoices enable row level security;
create policy "admins gèrent les entreprises" on public.partners
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins gèrent les employés" on public.partner_employees
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins gèrent les bons" on public.partner_delivery_notes
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins gèrent les factures" on public.partner_invoices
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create trigger touch_partners_updated before update on public.partners
  for each row execute function public.touch_updated_at();
create trigger touch_partner_employees_updated before update on public.partner_employees
  for each row execute function public.touch_updated_at();

-- Liste publique des entreprises (nom seulement) pour le panier.
create or replace function public.list_partners()
returns table (id uuid, name text)
language sql stable security definer set search_path = public as $$
  select p.id, p.name from public.partners p where p.active order by p.name;
$$;

-- Commande d'un employé : entreprise + téléphone + code. Pas de paiement (facturée à l'entreprise).
-- Livraison à l'adresse de l'entreprise. Heure limite propre à chaque entreprise.
create or replace function public.place_partner_order(p_partner uuid, p_phone text, p_pin text, p_items jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_partner record; v_emp record; v_item jsonb; v_dp record; v_jv record; v_qty int;
  v_total int := 0; v_order_id uuid; v_ref text; v_seq int;
  v_now timestamp := (now() at time zone 'Africa/Dakar');
  v_phone text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_first_day date; v_deadline timestamp; v_size_label text;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then raise exception 'Votre panier est vide.'; end if;
  select * into v_partner from public.partners where id = p_partner and active;
  if not found then raise exception 'Entreprise introuvable.'; end if;

  select * into v_emp from public.partner_employees
  where partner_id = p_partner and phone = v_phone and active for update;
  if not found then
    raise exception 'Ce numéro n''est pas enregistré pour %. Contactez votre responsable.', v_partner.name;
  end if;
  if v_emp.pin_failures >= 5 then
    raise exception 'Code bloqué après trop d''essais. Contactez le restaurant pour en recevoir un nouveau.';
  end if;
  if v_emp.pin <> trim(coalesce(p_pin, '')) then
    update public.partner_employees set pin_failures = pin_failures + 1 where id = v_emp.id;
    return jsonb_build_object('ok', false, 'error', 'Code incorrect.');
  end if;
  update public.partner_employees set pin_failures = 0 where id = v_emp.id and pin_failures > 0;

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

revoke all on function public.list_partners() from public;
revoke all on function public.place_partner_order(uuid, text, text, jsonb) from public;
grant execute on function public.list_partners() to anon, authenticated, service_role;
grant execute on function public.place_partner_order(uuid, text, text, jsonb) to anon, authenticated, service_role;
