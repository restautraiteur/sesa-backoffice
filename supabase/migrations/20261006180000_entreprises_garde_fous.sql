-- Garde-fous de la commande entreprise sans code (entreprise + nom + téléphone) :
-- 1. téléphone sénégalais valide (9 chiffres, mobile 7x ou fixe 33, préfixe 221 accepté) ;
-- 2. employé de la liste : le nom saisi doit correspondre au nom enregistré (au moins un mot) ;
-- 3. plafond de repas par employé et par jour (réglable par entreprise, 2 par défaut) ;
-- 4. accès libre : au plus 30 nouveaux employés ajoutés automatiquement par entreprise et par jour.
-- Les anciennes fonctions avec code, plus utilisées par le site, ne sont plus accessibles aux visiteurs.

alter table public.partners
  add column max_meals_per_day integer not null default 2 check (max_meals_per_day between 1 and 20);
comment on column public.partners.max_meals_per_day is
  'Nombre maximum de plats qu''un employé peut commander pour un même jour.';
alter table public.partner_employees
  add column auto_enrolled boolean not null default false;

-- Mots d'un nom, en minuscules et sans accents (pour comparer « Awa Ndiaye » et « NDIAYE awa »).
create or replace function public._name_words(p text)
returns text[]
language sql immutable set search_path = public as $$
  select coalesce(array_agg(w), '{}')
  from regexp_split_to_table(
    translate(lower(coalesce(p, '')), 'àâäáãçéèêëíìîïñóòôöõúùûüýÿ', 'aaaaaceeeeiiiinooooouuuuyy'),
    '[^a-z0-9]+') as w
  where length(w) >= 2;
$$;
revoke all on function public._name_words(text) from public, anon, authenticated;

create or replace function public.place_partner_order_simple(p_partner uuid, p_full_name text, p_phone text, p_items jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_partner record; v_emp record; v_emp_id uuid; v_day record; v_already int; v_new_today int;
  v_phone text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_name text := btrim(regexp_replace(coalesce(p_full_name, ''), '\s+', ' ', 'g'));
begin
  if length(v_name) < 2 or length(v_name) > 80 then raise exception 'Indiquez votre nom et prénom.'; end if;
  if v_phone ~ '^(00)?221' then v_phone := regexp_replace(v_phone, '^(00)?221', ''); end if;
  if v_phone !~ '^(7[05678]|33)[0-9]{7}$' then
    raise exception 'Numéro de téléphone invalide : 9 chiffres, par exemple 77 123 45 67.';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0
     or jsonb_array_length(p_items) > 60 then
    raise exception 'Panier invalide.';
  end if;

  select * into v_partner from public.partners where id = p_partner and active;
  if not found then raise exception 'Entreprise introuvable.'; end if;

  select * into v_emp from public.partner_employees
  where partner_id = p_partner and phone in (v_phone, '221' || v_phone, '00221' || v_phone)
  order by (phone = v_phone) desc limit 1 for update;
  if found then
    if not v_emp.active then
      raise exception 'Ce numéro est désactivé pour %. Contactez votre responsable.', v_partner.name;
    end if;
    -- Le nom saisi doit partager au moins un mot avec le nom enregistré.
    if not (public._name_words(v_name) && public._name_words(v_emp.full_name)) then
      raise exception 'Le nom ne correspond pas à ce numéro pour %. Vérifiez votre saisie ou contactez votre responsable.', v_partner.name;
    end if;
    v_emp_id := v_emp.id;
  else
    if not v_partner.open_enrollment then
      raise exception 'Ce numéro n''est pas sur la liste des employés de %. Contactez votre responsable.', v_partner.name;
    end if;
    perform pg_advisory_xact_lock(hashtext('partner_enroll:' || p_partner::text));
    select count(*) into v_new_today from public.partner_employees
    where partner_id = p_partner and auto_enrolled
      and created_at >= (now() at time zone 'Africa/Dakar')::date at time zone 'Africa/Dakar';
    if v_new_today >= 30 then
      raise exception 'Trop de nouvelles inscriptions aujourd''hui pour %. Contactez votre responsable.', v_partner.name;
    end if;
    insert into public.partner_employees (partner_id, full_name, phone, email, auto_enrolled)
    values (p_partner, v_name, v_phone, '', true)
    returning id into v_emp_id;
  end if;

  -- Plafond de plats par jour (commandes déjà passées + panier).
  for v_day in
    select d.date as day_date, sum((i->>'quantity')::int) as qty
    from jsonb_array_elements(p_items) i
    join public.day_products dp on dp.id = (i->>'day_product_id')::uuid
    join public.days d on d.id = dp.day_id
    join public.products p on p.id = dp.product_id
    where i ? 'day_product_id' and p.category <> 'jus'
    group by d.date
  loop
    select coalesce(sum(oi.quantity), 0) into v_already
    from public.order_items oi join public.orders o on o.id = oi.order_id
    where o.partner_employee_id = v_emp_id and o.status not in ('annulee', 'en_attente_paiement')
      and oi.day_date = v_day.day_date and oi.category <> 'jus';
    if v_already + v_day.qty > v_partner.max_meals_per_day then
      raise exception 'Limite de % plat(s) par jour atteinte pour le % (déjà commandé : %).',
        v_partner.max_meals_per_day, to_char(v_day.day_date, 'DD/MM'), v_already;
    end if;
  end loop;

  return public._place_partner_order_core(p_partner, v_emp_id, p_items);
end;
$$;
revoke all on function public.place_partner_order_simple(uuid, text, text, jsonb) from public;
grant execute on function public.place_partner_order_simple(uuid, text, text, jsonb) to anon, authenticated;

-- Fonctions avec code, plus utilisées par le site : fermées aux visiteurs.
revoke execute on function public.place_partner_order(uuid, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.partner_my_choices(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.partner_change_choice(uuid, text, text, uuid, uuid) from public, anon, authenticated;
