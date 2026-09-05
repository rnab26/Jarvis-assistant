-- Combien de temps Jarvis garde le mot-à-mot des conversations.
-- Chantier 5ca5c4a3, 5 sept. 2026.
--
-- CE QUI ÉTAIT EN DUR : `purger_echanges()` (migration 0006) effaçait tout ce
-- qui dépassait `interval '7 days'`, écrit dans le corps de la fonction. Aucun
-- moyen d'en changer sans une migration, et aucun moyen pour Raphaël de savoir
-- que ça existait.
--
-- SA DÉCISION, et le désaccord qui a été tranché. Deux fiches lui ont posé la
-- même question le même soir : « Sans limite » d'un côté (« illimité mais
-- ultra compacter pour comprendre le nécessaire »), « réglable depuis
-- Paramètres, réglé sur 30 jours au départ » de l'autre. Ce qui est commun et
-- non discutable : la durée devient un réglage. Le défaut retenu est SANS
-- LIMITE, et pas pour un goût — supprimer est irréversible, garder ne l'est
-- pas. Un défaut à 30 jours effacerait ses conversations d'août sans que
-- personne s'en aperçoive ; un défaut sans limite ne coûte rien et il descend
-- à 7, 30 ou 90 jours d'un appui.
--
-- POURQUOI TROIS FONCTIONS ET PAS UNE. Ce qui peut être faux ici est faux EN
-- SILENCE : un réglage mal lu, et on efface des mois de conversations sans
-- qu'aucune erreur ne soit levée. `retention_jours(text)` isole la seule
-- partie qui décide, et elle se vérifie pour de vrai, valeur par valeur,
-- depuis `scripts/sql.sh` — ce qu'on ne peut pas faire de `purger_echanges()`,
-- qui dépend de `auth.uid()` et supprime.

-- Le nombre de jours à garder, ou NULL pour « on ne supprime rien ».
--
-- Tout ce qui n'est pas un nombre de jours plausible vaut « sans limite » :
-- une valeur vide, un réglage abîmé, un « illimite », un zéro, un négatif.
-- Le sens du doute va vers CONSERVER — se tromper dans l'autre sens détruit.
create or replace function retention_jours(valeur text)
returns int
language sql
immutable
set search_path = pg_temp
as $$
  select case
    when valeur ~ '^[0-9]{1,4}$' and valeur::int between 1 and 3650 then valeur::int
    else null
  end;
$$;

comment on function retention_jours(text) is
  'Jours de conservation du mot-a-mot des echanges, NULL = sans limite. Toute valeur douteuse vaut sans limite : supprimer est irreversible.';

-- Le réglage d'un utilisateur, lu dans la table `reglages` (migration 0014),
-- sous la même clé que le stockage local de l'app.
create or replace function retention_echanges(p_user_id uuid)
returns int
language sql
stable
set search_path = public, pg_temp
as $$
  select retention_jours(r.valeurs->>'jarvis_memoire_retention')
  from reglages r
  where r.user_id = p_user_id;
$$;

-- Purge du mot-à-mot. Appelée à chaque échange plutôt que planifiée : pas de
-- tâche à maintenir, et le volume reste minuscule.
--
-- Sans ligne dans `reglages` (compte neuf, réglages jamais synchronisés), la
-- sous-requête ne rend AUCUNE ligne : `jours` est NULL, donc on ne supprime
-- rien. C'est le bon défaut, et ce n'est pas un hasard — un compte dont on ne
-- connaît pas encore les préférences ne doit rien perdre.
create or replace function purger_echanges()
returns int
language sql
security invoker
set search_path = public, pg_temp
as $$
  with jours as (
    select retention_echanges((select auth.uid())) as n
  ),
  supprimes as (
    delete from echanges
    where user_id = (select auth.uid())
      and (select n from jours) is not null
      and created_at < now() - make_interval(days => (select n from jours))
    returning 1
  )
  select count(*)::int from supprimes;
$$;
