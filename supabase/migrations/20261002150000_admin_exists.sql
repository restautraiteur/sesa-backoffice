-- Indique si un gérant existe déjà, sans révéler qui.
-- Utilisé par la page de connexion pour masquer « Créer un compte » une fois le gérant créé.
create or replace function public.admin_exists()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where role = 'admin')
$$;
revoke all on function public.admin_exists() from public;
grant execute on function public.admin_exists() to anon, authenticated, service_role;
