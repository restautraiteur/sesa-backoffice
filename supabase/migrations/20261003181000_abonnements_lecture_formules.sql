-- Correctif : les visiteurs (anon) n'ont pas le droit d'appeler is_admin() ; la politique de lecture
-- des formules est donc séparée : visiteurs = formules actives, gérant = toutes.
drop policy if exists "formules actives publiques" on public.subscription_plans;
create policy "formules actives visibles des visiteurs" on public.subscription_plans
  for select to anon using (active);
create policy "formules visibles des connectés" on public.subscription_plans
  for select to authenticated using (active or public.is_admin());
