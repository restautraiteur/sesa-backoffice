-- Espace de stockage public des photos de produits (utilisé par upload-photo.ts).
-- Créé jusqu'ici hors migrations ; nécessaire pour une base Supabase neuve.
insert into storage.buckets (id, name, public)
values ('plats', 'plats', true)
on conflict (id) do nothing;
