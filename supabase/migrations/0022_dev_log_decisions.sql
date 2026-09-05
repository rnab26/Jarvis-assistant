-- Ce que Raphaël répond doit vivre dans SON app, pas dans un artefact.
-- Chantier 85ae62b5, 5 sept. 2026.
--
-- SES MOTS : « J'ai répondu à ton artefact mais j'ai l'impression qu'il
-- n'enregistre pas mes réponses, du coup j'ai pris des captures d'écran pour
-- te renvoyer mes réponses et éviter de répondre une fois de plus. D'ailleurs
-- règle ce problème, les artefacts ont trop de durée de vie limitée. »
--
-- POURQUOI ON N'OUVRE PAS UNE TABLE À PART. La tentation était d'écrire une
-- table `decisions`. Elle aurait fait exactement ce que `dev_log` fait déjà :
-- une session pose une question (kind = 'question', item_id = le chantier),
-- Raphaël répond (kind = 'reponse'), `answered_at` referme. Le hook de
-- démarrage lit déjà ce journal, le cockpit l'affiche déjà, et la carte
-- dépliée d'un chantier porte déjà sa conversation. Deux tables de questions
-- auraient voulu dire deux endroits où chercher — la moitié des questions
-- dans l'une, la moitié dans l'autre, et personne pour s'en apercevoir.
--
-- Ce qui manquait vraiment tient en quatre colonnes : les OPTIONS cliquables
-- (répondre au pouce, depuis un téléphone), le POURQUOI de la question (une
-- question dont on ne voit pas l'enjeu reste sans réponse), l'ÉTAT d'une
-- action de son côté (fait / pas encore / ça bloque), et la PHOTO — le point
-- précis où la fiche du 5 sept. échouait.

alter table dev_log add column if not exists pourquoi text;
alter table dev_log add column if not exists options jsonb;
alter table dev_log add column if not exists etat text;
alter table dev_log add column if not exists photo_chemin text;

-- « action » : ce que RAPHAËL doit faire (créer une clé, la déposer, installer
-- l'APK), par opposition à « question », où il DÉCIDE. Sa règle les sépare
-- depuis les premières fiches : pour une action il ne choisit pas, il dit où
-- il en est.
do $$
begin
  alter table dev_log drop constraint if exists dev_log_kind_check;
  alter table dev_log add constraint dev_log_kind_check
    check (kind in ('question', 'reponse', 'info', 'blocage', 'action'));
end $$;

-- Fait / Pas encore / Ça bloque, et rien d'autre : trois états, parce qu'une
-- action a besoin de dire qu'elle COINCE, pas seulement qu'elle n'est pas
-- faite. C'est ce qui manquait aux fiches — « il me demande de créer des clés,
-- mais je ne peux pas écrire si je l'ai fait, si ça bloque ».
do $$
begin
  alter table dev_log drop constraint if exists dev_log_etat_check;
  alter table dev_log add constraint dev_log_etat_check
    check (etat is null or etat in ('fait', 'pas_encore', 'bloque'));
end $$;

-- Les questions ouvertes se lisent au démarrage de chaque session : elles
-- doivent se trouver sans parcourir tout le journal.
create index if not exists dev_log_en_attente_idx
  on dev_log (user_id, created_at desc)
  where answered_at is null and kind in ('question', 'action');

-- Les captures d'écran de Raphaël. Un bucket à part plutôt que « documents » :
-- ses documents sont une liste qu'il consulte, et y verser les captures d'une
-- réponse la rendrait illisible en quelques jours. Mêmes règles d'isolement
-- que « documents » — chaque fichier sous <user_id>/…, donc
-- storage.foldername(name)[1] = auth.uid().
insert into storage.buckets (id, name, public)
values ('cockpit', 'cockpit', false)
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'cockpit_select_own'
  ) then
    create policy "cockpit_select_own" on storage.objects
      for select using (
        bucket_id = 'cockpit' and (select auth.uid())::text = (storage.foldername(name))[1]
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'cockpit_insert_own'
  ) then
    create policy "cockpit_insert_own" on storage.objects
      for insert with check (
        bucket_id = 'cockpit' and (select auth.uid())::text = (storage.foldername(name))[1]
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'cockpit_delete_own'
  ) then
    create policy "cockpit_delete_own" on storage.objects
      for delete using (
        bucket_id = 'cockpit' and (select auth.uid())::text = (storage.foldername(name))[1]
      );
  end if;
end $$;
