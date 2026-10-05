-- Catalogue initial des jus : petit (25 cl) à 500 FCFA, grand (1,5 L) entre 2500 et 3000 FCFA.
-- Images par défaut dans /public/jus/ ; à remplacer par les vraies photos depuis l'espace gérant.
-- Stock de départ indicatif (20 petits, 10 grands), à ajuster dans « Produits ».

with seed(name, description, photo_url, grand_price) as (
  values
    ('Bissap', 'Fleurs d''hibiscus infusées, menthe et sucre de canne.', '/jus/bissap.svg', 2500),
    ('Bouye', 'Pulpe de fruit du baobab, onctueuse et vanillée.', '/jus/bouye.svg', 3000),
    ('Mangue', 'Mangues mûres mixées, 100 % fruit.', '/jus/mangue.svg', 2500),
    ('Fraise', 'Fraises fraîches mixées, douces et fruitées.', '/jus/fraise.svg', 3000),
    ('Solom', 'Fruit du tamarinier noir (solom), acidulé et rafraîchissant.', '/jus/solom.svg', 3000),
    ('Citronnade', 'Citrons pressés, gingembre et menthe.', '/jus/citronnade.svg', 2500),
    ('Madd', 'Fruit du madd (saba), sucré-acidulé.', '/jus/madd.svg', 3000)
),
inserted as (
  insert into public.products (name, description, photo_url, category, base_price, active)
  select s.name, s.description, s.photo_url, 'jus', 500, true
  from seed s
  where not exists (
    select 1 from public.products p where lower(p.name) = lower(s.name) and p.category = 'jus'
  )
  returning id, name
),
juices as (
  select i.id, s.grand_price from inserted i join seed s on s.name = i.name
  union
  select p.id, s.grand_price from public.products p join seed s on lower(s.name) = lower(p.name)
  where p.category = 'jus'
)
insert into public.product_variants (product_id, size, price, stock)
select j.id, v.size, case v.size when 'petit' then 500 else j.grand_price end,
       case v.size when 'petit' then 20 else 10 end
from juices j
cross join (values ('petit'), ('grand')) as v(size)
on conflict (product_id, size) do nothing;
