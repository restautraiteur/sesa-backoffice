-- La cuisine prépare tout en même temps : les statuts « en_preparation » et « prete » disparaissent.
-- Les commandes qui les portaient redeviennent « confirmee » (étape juste avant la livraison).
update public.orders
set status = 'confirmee'
where status in ('en_preparation', 'prete');
