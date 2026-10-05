-- Formules d'abonnement de départ, toutes avec livraison incluse.
-- Rejouable : une formule avec le même nombre de repas n'est pas recréée.
-- Prix et noms modifiables ensuite dans Back-office › Abonnements › Formules.
insert into public.subscription_plans (name, meals_count, price, delivery_included, active, sort_order)
select v.name, v.meals_count, v.price, true, true, v.sort_order
from (values
  ('Le Mois complet',      22, 78000, 1),
  ('Le Régulier',         12, 48000, 2),
  ('Semaine complète',     5, 20000, 3),
  ('4 midis par semaine',  4, 16000, 4),
  ('3 midis par semaine',  3, 12000, 5)
) as v(name, meals_count, price, sort_order)
where not exists (
  select 1 from public.subscription_plans p
  where p.meals_count = v.meals_count
);
