-- Délai de paiement de chaque entreprise partenaire et date d'échéance des factures.
alter table public.partners
  add column payment_terms_days integer not null default 30 check (payment_terms_days between 0 and 120);
alter table public.partner_invoices add column due_date date;
update public.partner_invoices i
set due_date = (i.sent_at at time zone 'Africa/Dakar')::date + p.payment_terms_days
from public.partners p where p.id = i.partner_id and i.due_date is null;
