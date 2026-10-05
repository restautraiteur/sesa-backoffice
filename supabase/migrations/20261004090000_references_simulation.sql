-- Simulation à partir de références.
-- Une cuisson (production_logs) devient une « référence » quand le gérant clôture la journée depuis
-- le tableau de bord : on y garde ce qui a été préparé, vendu (repas d'abonnés compris) et le chiffre
-- d'affaires. Le simulateur repart d'une référence choisie et l'agrandit ou la réduit.
alter table public.production_logs
  add column is_reference boolean not null default false,
  add column plates_sold integer check (plates_sold is null or plates_sold >= 0),
  add column revenue integer check (revenue is null or revenue >= 0),
  add column sold_out boolean,
  add column closed_at timestamptz;

create index idx_production_logs_reference on public.production_logs(product_id, cooked_on desc)
  where is_reference;
