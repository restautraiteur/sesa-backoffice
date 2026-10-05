-- Paiements reçus des entreprises partenaires (virement, chèque, Wave, espèces…), en une ou plusieurs
-- fois, rattachés à une facture (ou non). La facture se met à jour : montant réglé, « partielle »,
-- « payée » quand tout est réglé. Sert à connaître le chiffre d'affaires réellement encaissé.
create table public.partner_payments (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete cascade,
  invoice_id uuid references public.partner_invoices(id) on delete set null,
  amount integer not null check (amount > 0),
  paid_on date not null default (now() at time zone 'Africa/Dakar')::date,
  method text not null default 'virement' check (method in ('virement', 'cheque', 'wave', 'orange_money', 'especes', 'autre')),
  reference text,
  note text,
  created_at timestamptz not null default now()
);
create index idx_partner_payments_partner on public.partner_payments(partner_id, paid_on desc);
create index idx_partner_payments_invoice on public.partner_payments(invoice_id);

grant select, insert, update, delete on public.partner_payments to authenticated;
grant all on public.partner_payments to service_role;
alter table public.partner_payments enable row level security;
create policy "admins gèrent les paiements entreprises" on public.partner_payments
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

alter table public.partner_invoices add column amount_paid integer not null default 0 check (amount_paid >= 0);
alter table public.partner_invoices drop constraint partner_invoices_status_check;
alter table public.partner_invoices add constraint partner_invoices_status_check
  check (status in ('envoyee', 'partielle', 'payee'));

-- Montant réglé et statut de la facture recalculés à chaque paiement.
create or replace function public.sync_partner_invoice_payment()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  foreach v_id in array array_remove(array[
    case when tg_op <> 'INSERT' then old.invoice_id end,
    case when tg_op <> 'DELETE' then new.invoice_id end], null)
  loop
    update public.partner_invoices i
    set amount_paid = coalesce((select sum(amount) from public.partner_payments where invoice_id = i.id), 0),
        status = case
          when coalesce((select sum(amount) from public.partner_payments where invoice_id = i.id), 0) >= i.total then 'payee'
          when coalesce((select sum(amount) from public.partner_payments where invoice_id = i.id), 0) > 0 then 'partielle'
          else 'envoyee' end,
        paid_at = case
          when coalesce((select sum(amount) from public.partner_payments where invoice_id = i.id), 0) >= i.total
          then coalesce(i.paid_at, now()) else null end
    where i.id = v_id;
  end loop;
  return null;
end;
$$;
revoke all on function public.sync_partner_invoice_payment() from public, anon, authenticated;
create trigger sync_partner_invoice_payment after insert or update or delete on public.partner_payments
  for each row execute function public.sync_partner_invoice_payment();

-- Factures déjà marquées payées : on enregistre le paiement correspondant (historique cohérent).
insert into public.partner_payments (partner_id, invoice_id, amount, paid_on, method, note)
select partner_id, id, total, coalesce((paid_at at time zone 'Africa/Dakar')::date, current_date), 'autre', 'Repris (facture déjà payée)'
from public.partner_invoices where status = 'payee' and total > 0;
