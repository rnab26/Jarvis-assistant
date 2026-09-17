-- Le journal de bord se diffuse en direct, comme les chantiers.
--
-- Chantier 221a3ba6, « la mise à jour automatique et instantanée (live) dans
-- le cockpit dev ». `dev_items`, `dev_sections` et `jarvis_erreurs` sont déjà
-- en temps réel (migrations 0011, 0020) ; `dev_log` ne l'était pas — une
-- question posée ou une réponse écrite depuis une autre session ou un autre
-- appareil n'apparaissait qu'au retour au premier plan de l'app restée
-- ouverte, jamais tout de suite. C'est le journal qui alimente « Ce qui
-- attend ta décision », « Depuis ton dernier passage » et la conversation
-- d'un chantier déplié : tous les trois en héritaient.
--
-- Même REPLICA IDENTITY FULL qu'en 0011/0020 : sans elle un DELETE (ou un
-- UPDATE qui ne change qu'une colonne) ne transporte que la clé primaire,
-- Realtime ne peut pas évaluer la policy RLS sur user_id, et l'événement
-- n'est jamais délivré.

alter table public.dev_log replica identity full;

alter publication supabase_realtime add table public.dev_log;
