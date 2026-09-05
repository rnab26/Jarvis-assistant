-- La mémoire de Jarvis peut mourir sans que personne le voie.
--
-- CE QUI S'EST PASSÉ (4 sept. 2026, chantier 9ab3ca4d). Le modèle sur lequel
-- tournait la mémorisation était plafonné à VINGT requêtes par jour et par
-- projet. Passé vingt phrases, plus aucun souvenir n'était écrit. Or la
-- mémorisation est SILENCIEUSE par construction — c'est le choix de Raphaël,
-- elle ne doit jamais le déranger — et elle avale toutes ses erreurs. Rien,
-- absolument rien, ne le disait. Ça n'a été vu que parce qu'une vérification
-- est allée regarder la base.
--
-- Mesuré ce jour-là sur ses vraies données : 42 échanges depuis le dernier
-- souvenir retenu, alors que le plus long silence NORMAL jamais observé sur
-- tout son historique est de 5 échanges. L'écart se voyait donc parfaitement
-- dans les données ; il n'y avait simplement personne pour regarder.
--
-- Cette fonction est ce regard. Elle ne notifie rien : elle rend de quoi
-- afficher un témoin dans l'onglet Mémoire, que Raphaël consulte quand il
-- veut. La mémoire reste muette, c'est le témoin qui parle.

-- LA COLONNE QUI MANQUAIT. `updated_at` ne peut pas servir de témoin : il
-- bouge aussi quand Raphaël corrige un souvenir à la main dans l'onglet
-- Mémoire, ou quand la passe de rattrapage périme un doublon. Le témoin
-- annoncerait alors « mémoire active » alors que c'est un humain qui vient
-- d'écrire. Et `created_at` seul ne suffit pas non plus : depuis le
-- dédoublonnage, une redite FUSIONNE dans un souvenir existant — la mémoire a
-- travaillé sans qu'aucune ligne n'apparaisse.
--
-- D'où une date que SEULE la mémorisation pose : `ranger()` l'écrit quand elle
-- fusionne, et rien d'autre n'y touche.
alter table souvenirs add column if not exists fusionne_at timestamptz;

create or replace function sante_memoire()
returns table (
  dernier_souvenir timestamptz,
  souvenirs_vivants int,
  -- Le compte qui trahit la panne : des phrases dictées, et rien de retenu.
  -- Zéro fait retenu est une réponse NORMALE et fréquente (la plupart des
  -- échanges n'ont rien à retenir), d'où le comptage plutôt qu'une alerte
  -- au premier silence.
  echanges_depuis int,
  -- La dernière panne que la mémoire a su signaler elle-même, s'il y en a
  -- une : c'est le diagnostic, là où le compte n'est que le symptôme.
  erreur_titre text,
  erreur_detail text,
  erreur_last_seen timestamptz,
  erreur_occurrences int
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with moi as (select (select auth.uid()) as uid),
  -- Les deux dates que la mémorisation pose elle-même, et elles seules :
  -- création d'un souvenir, ou fusion d'une redite dans un souvenir existant.
  -- Surtout pas `updated_at`, qui bouge aussi sous la main de Raphaël.
  dernier as (
    select greatest(max(created_at), max(fusionne_at)) as t
    from souvenirs, moi where user_id = moi.uid
  ),
  erreur as (
    select titre, detail, last_seen, occurrences
    from jarvis_erreurs, moi
    where user_id = moi.uid and source = 'memoire'
    order by last_seen desc
    limit 1
  )
  select
    (select t from dernier),
    (select count(*)::int from souvenirs, moi where user_id = moi.uid and perime_at is null),
    (select count(*)::int from echanges, moi
      where user_id = moi.uid
        and created_at > coalesce((select t from dernier), timestamptz '-infinity')),
    (select titre from erreur),
    (select detail from erreur),
    (select last_seen from erreur),
    (select occurrences from erreur);
$$;
