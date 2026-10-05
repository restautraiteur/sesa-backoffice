-- Envoi automatique des factures : jour d'envoi par entreprise (ex. le 24) ; la facture couvre la période
-- depuis la facture précédente (du 25 du mois dernier au 24). Email au responsable (contact de l'entreprise).
alter table public.partners
  add column billing_day integer check (billing_day between 1 and 28);
comment on column public.partners.billing_day is
  'Jour du mois où la facture part automatiquement par email (null = facturation manuelle, mois civil).';

alter table public.partner_invoices
  add column period_start date,
  add column period_end date,
  add column emailed_at timestamptz,
  add column email_to text;
update public.partner_invoices
set period_start = month,
    period_end = (month + interval '1 month - 1 day')::date
where period_start is null;
