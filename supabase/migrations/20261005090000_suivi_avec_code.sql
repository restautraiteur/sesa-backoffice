-- Suivi « Mon abonnement » : téléphone + code abonné (le numéro seul ne suffit plus).
-- 5 essais faux → bloqué (le gérant génère un nouveau code). L'ancienne fonction (téléphone seul)
-- n'est plus accessible aux visiteurs.
create or replace function public.lookup_subscriptions(p_phone text, p_pin text)
returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare
  v_phone text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_ids uuid[];
  v_result jsonb;
begin
  if length(v_phone) < 7 or coalesce(trim(p_pin), '') !~ '^\d{4}$' then
    return jsonb_build_object('ok', false, 'error', 'Indiquez votre numéro et votre code à 4 chiffres.');
  end if;
  if exists (select 1 from public.subscriptions where phone = v_phone and status <> 'annulee')
     and not exists (select 1 from public.subscriptions
                     where phone = v_phone and status <> 'annulee' and pin_failures < 5) then
    return jsonb_build_object('ok', false,
      'error', 'Code bloqué après trop d''essais. Contactez le restaurant pour en recevoir un nouveau.');
  end if;
  select array_agg(id) into v_ids from public.subscriptions
  where phone = v_phone and pin = trim(p_pin) and status <> 'annulee' and pin_failures < 5;
  if v_ids is null then
    update public.subscriptions set pin_failures = pin_failures + 1
    where phone = v_phone and status <> 'annulee';
    return jsonb_build_object('ok', false, 'error', 'Numéro ou code abonné incorrect.');
  end if;
  update public.subscriptions set pin_failures = 0 where id = any(v_ids) and pin_failures > 0;
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
  where s.id = any(v_ids)
  into v_result;
  return jsonb_build_object('ok', true, 'subscriptions', v_result);
end;
$fn$;

revoke execute on function public.lookup_subscriptions(text) from anon, authenticated, public;
revoke all on function public.lookup_subscriptions(text, text) from public;
grant execute on function public.lookup_subscriptions(text, text) to anon, authenticated, service_role;
