create or replace function public.claim_admin()
returns boolean language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return false; end if;
  if exists (select 1 from public.user_roles where role = 'admin') then
    return exists (select 1 from public.user_roles where user_id = v_uid and role = 'admin');
  end if;
  insert into public.user_roles (user_id, role) values (v_uid, 'admin') on conflict do nothing;
  return true;
end;
$$;
revoke all on function public.claim_admin() from public, anon;
grant execute on function public.claim_admin() to authenticated;