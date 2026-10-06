-- Panier entreprise : jours dont l'heure limite est passée pour une entreprise (heure du serveur,
-- fuseau de Dakar), pour prévenir l'employé avant qu'il valide, au lieu d'un refus à la validation.
create or replace function public.partner_closed_days(p_partner uuid, p_days date[])
returns table (day_date date, deadline text)
language sql stable security definer set search_path = public as $$
  select d, to_char((d - p.cutoff_day_offset) + p.cutoff_time, 'DD/MM à HH24"h"MI')
  from public.partners p, unnest(coalesce(p_days, '{}'::date[])) as d
  where p.id = p_partner and p.active
    and (now() at time zone 'Africa/Dakar') >= (d - p.cutoff_day_offset) + p.cutoff_time
  order by d;
$$;
revoke all on function public.partner_closed_days(uuid, date[]) from public;
grant execute on function public.partner_closed_days(uuid, date[]) to anon, authenticated;
