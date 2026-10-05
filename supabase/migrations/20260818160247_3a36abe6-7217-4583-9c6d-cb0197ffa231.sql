revoke all on function public.has_role(uuid, app_role) from public, anon;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated, service_role;
grant execute on function public.has_role(uuid, app_role) to authenticated, service_role;