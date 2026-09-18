-- L'écran « Programmé » (chantier 0c0193e3) doit voir apparaître, sans
-- recharger, un envoi programmé à la voix pendant qu'il a l'écran ouvert —
-- même mécanisme temps réel que tasks/dev_items/notes (migration 0011,
-- 0040) : REPLICA IDENTITY FULL, sans quoi un DELETE/UPDATE ne transporte
-- que la clé primaire et Realtime ne peut pas évaluer la policy RLS sur
-- user_id. Sans cette migration, `messages_programmes` (créée en 0017)
-- restait invisible du canal Realtime malgré son cloisonnement RLS existant.
alter table public.messages_programmes replica identity full;
alter publication supabase_realtime add table public.messages_programmes;
