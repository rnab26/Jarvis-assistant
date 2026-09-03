-- Rafraîchissement automatique de l'affichage des tâches.
--
-- Jusqu'ici l'app ne rechargeait que sur ses propres écritures et au retour
-- au premier plan : une tâche créée depuis le web n'apparaissait pas dans
-- l'app ouverte (et inversement), et un changement fait ailleurs restait
-- invisible tant que Raphaël ne basculait pas d'application. La publication
-- supabase_realtime existait mais ne contenait aucune table : aucun
-- changement n'était donc diffusé.
--
-- REPLICA IDENTITY FULL : sans ça, un DELETE ne transporte que la clé
-- primaire, Realtime ne peut pas évaluer la policy RLS sur user_id et
-- l'événement n'est jamais délivré — une tâche supprimée ailleurs resterait
-- affichée. Coût : quelques octets de WAL en plus par écriture, négligeable
-- sur des tables de cette taille.

alter table public.tasks replica identity full;
alter table public.categories replica identity full;
alter table public.dev_items replica identity full;

alter publication supabase_realtime add table public.tasks;
alter publication supabase_realtime add table public.categories;
alter publication supabase_realtime add table public.dev_items;
