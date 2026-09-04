-- Les sections et les erreurs se diffusent comme les chantiers.
--
-- Sans ça, une section créée à la voix ou depuis le web n'apparaîtrait pas
-- dans l'app restée ouverte, et une erreur signalée automatiquement pendant
-- que Raphaël regarde le cockpit n'y arriverait qu'au prochain retour au
-- premier plan. Même raison qu'en 0011, et même REPLICA IDENTITY FULL : sans
-- elle un DELETE ne transporte que la clé primaire, Realtime ne peut pas
-- évaluer la policy sur user_id, et l'événement n'est jamais délivré — une
-- section supprimée ailleurs resterait affichée.

alter table public.dev_sections replica identity full;
alter table public.jarvis_erreurs replica identity full;

alter publication supabase_realtime add table public.dev_sections;
alter publication supabase_realtime add table public.jarvis_erreurs;
