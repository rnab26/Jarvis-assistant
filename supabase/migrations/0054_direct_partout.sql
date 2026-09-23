-- Tout ce qui se passe dans Jarvis s'affiche en direct, réglages compris.
--
-- Chantier e687f0e2, sa dictée du 23 sept. 2026 (et 67dd962b, la même le
-- 21 sept.) : « Mise à jour live et automatique de tout ce qui se passe dans
-- l'environnement de Jarvis — exemple lorsqu'une tâche ou un chantier est
-- créé ou modifié ou un réglage doit s'appliquer instantanément ».
--
-- MESURÉ AVANT D'ÉCRIRE, pas supposé : la publication `supabase_realtime`
-- portait 9 tables. Les tâches et les chantiers y étaient déjà (ce69489b) ;
-- les RÉGLAGES non — un réglage changé sur le site n'arrivait sur le
-- téléphone qu'à la connexion suivante. Et un vrai défaut muet :
-- `useEntrainement` s'abonnait à `sequences_entrainement`, qui n'était PAS
-- dans la publication — le canal passe « SUBSCRIBED » et ne reçoit jamais
-- rien, exactement le piège décrit en tête de useRealtimeRefresh.
--
-- REPLICA IDENTITY FULL sur les petites tables seulement : sans lui, une
-- SUPPRESSION ne porte pas `user_id`, et le filtre `user_id=eq.…` du canal
-- l'écarte. `souvenirs` et `echanges` portent une empreinte de 384 nombres :
-- les dupliquer dans le journal de réplication à chaque rattrapage
-- d'empreinte coûterait pour rien — on s'y contente des ajouts et des
-- modifications, et le retour au premier plan rattrape une suppression.

alter table public.reglages replica identity full;
alter table public.place_reminders replica identity full;
alter table public.prononciations replica identity full;
alter table public.passes_autonomes replica identity full;
alter table public.sequences_entrainement replica identity full;
alter table public.visites_cockpit replica identity full;

do $$
declare
  t text;
begin
  foreach t in array array[
    'reglages', 'souvenirs', 'echanges', 'place_reminders', 'prononciations',
    'passes_autonomes', 'sequences_entrainement', 'visites_cockpit'
  ]
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
