-- Réglages personnels de l'utilisateur, conservés côté serveur.
--
-- Chantier "Persistance des données après mises à jour". Vérification faite
-- avant d'écrire quoi que ce soit : tâches, catégories, chantiers, documents,
-- contacts, rappels de lieu, souvenirs et prononciations vivent déjà en base
-- et ne peuvent PAS être perdus par une mise à jour de l'APK. Ce qui était
-- réellement à risque, ce sont les réglages : mot-clé de réveil, voix,
-- rythme de discussion, config du widget, géolocalisation, et surtout
-- l'image du réacteur importée par Raphaël. Tout ça ne vivait que dans le
-- localStorage du téléphone — préservé par une mise à jour normale, mais
-- effacé par une désinstallation/réinstallation (ce qu'il a déjà dû faire)
-- ou un nettoyage des données de l'app. Et invisible depuis le web.
--
-- Un seul enregistrement par utilisateur, en JSON : ces réglages n'ont
-- aucune raison d'être requêtés par champ, et une colonne par réglage
-- imposerait une migration à chaque nouveau bouton.

create table if not exists reglages (
  user_id uuid primary key references auth.users (id) on delete cascade,
  valeurs jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table reglages enable row level security;

create policy "reglages_select_own" on reglages
  for select using ((select auth.uid()) = user_id);
create policy "reglages_insert_own" on reglages
  for insert with check ((select auth.uid()) = user_id);
create policy "reglages_update_own" on reglages
  for update using ((select auth.uid()) = user_id);
create policy "reglages_delete_own" on reglages
  for delete using ((select auth.uid()) = user_id);
