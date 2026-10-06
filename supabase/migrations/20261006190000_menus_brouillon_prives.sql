-- Les comptes connectés non gérants (inscription publique) voyaient les jours et les plats des
-- semaines en brouillon. Ils voient désormais la même chose que les visiteurs : les semaines publiées.
-- Les gérants gardent l'accès complet par leurs politiques « admins manage ».
drop policy if exists "days auth read" on public.days;
create policy "days auth read" on public.days for select to authenticated using (
  exists (select 1 from public.weeks w where w.id = days.week_id and w.status = 'published')
);
drop policy if exists "day_products auth read" on public.day_products;
create policy "day_products auth read" on public.day_products for select to authenticated using (
  exists (select 1 from public.days d join public.weeks w on w.id = d.week_id
          where d.id = day_products.day_id and w.status = 'published')
);
