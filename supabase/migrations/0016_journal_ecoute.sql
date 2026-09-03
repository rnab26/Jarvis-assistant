-- Journal d'écoute : ce que fait réellement le micro sur le téléphone.
--
-- Pourquoi : le réveil au mot « Jarvis » ne marche pas chez Raphaël, et
-- personne ne peut le reproduire depuis un poste de développement — il faut
-- son appareil, son moteur de reconnaissance (Samsung), sa voix. Jusqu'ici,
-- chaque correctif était posé à l'aveugle. L'app note désormais chaque
-- rafale d'écoute (démarrage, partiels reçus, mort silencieuse du service,
-- durée, issue) ; une session Claude Code lit la table et voit ce qui s'est
-- passé, plutôt que de deviner.
--
-- Léger et éphémère : purgé à 7 jours, comme les échanges. Aucune donnée
-- sensible : des horodatages, des compteurs, et au plus les 80 premiers
-- caractères de ce qui a été entendu.

create table if not exists journal_ecoute (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  at timestamptz not null default now(),
  -- Version de l'app (versionName Android ou "web"), pour savoir ce qui tournait.
  version text,
  -- rafale_debut, rafale_fin, service_mort, commande_debut, commande_fin, erreur…
  evenement text not null,
  detail jsonb not null default '{}'::jsonb
);

create index if not exists journal_ecoute_user_at on journal_ecoute (user_id, at desc);

alter table journal_ecoute enable row level security;

create policy "journal_ecoute_select_own" on journal_ecoute
  for select using (auth.uid() = user_id);
create policy "journal_ecoute_insert_own" on journal_ecoute
  for insert with check (auth.uid() = user_id);

-- Purge paresseuse, appelée par l'app : pas de tâche planifiée à maintenir.
create or replace function purger_journal_ecoute()
returns void
language sql
security definer
set search_path = public
as $$
  delete from journal_ecoute where at < now() - interval '7 days';
$$;
