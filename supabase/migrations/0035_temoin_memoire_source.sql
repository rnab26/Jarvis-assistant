-- 0035 — le témoin de la mémoire ne compte plus ce qui ne pouvait rien produire.
--
-- Voir la migration 0034 pour le constat complet. En deux lignes : le bandeau
-- « La mémoire de Jarvis ne retient plus rien » s'est affiché le 7 sept. 2026
-- à 18:21 chez lui, alors qu'un souvenir venait d'être créé à 18:23 (« L'épouse
-- de Raphaël se prénomme Yael », journal « mémoire : nouveau »). Le compteur
-- montait sur les commandes comprises sur l'appareil, qui ne passent jamais par
-- l'extraction de souvenirs.

CREATE OR REPLACE FUNCTION public.sante_memoire()
 RETURNS TABLE(dernier_souvenir timestamp with time zone, souvenirs_vivants integer, echanges_depuis integer, erreur_titre text, erreur_detail text, erreur_last_seen timestamp with time zone, erreur_occurrences integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    -- SEULS LES ÉCHANGES QUI POUVAIENT PRODUIRE UN SOUVENIR, depuis le
    -- 7 sept. 2026. Une commande comprise SUR L'APPAREIL (source
    -- « appareil ») ne passe jamais par l'extraction : la compter ici faisait
    -- monter le témoin sur des échanges qui ne pouvaient pas le faire
    -- redescendre, et plus Raphaël dictait de tâches, plus la mémoire avait
    -- l'air morte. Il l'a signalé le 7 sept. — le bandeau criait « ne retient
    -- plus rien » à la seconde même où un souvenir venait d'être créé.
    --
    -- `source is null` = échange antérieur à la migration 0034 : on ne sait
    -- pas par où il est passé, on le compte comme avant plutôt que de
    -- l'effacer du témoin.
    (select count(*)::int from echanges, moi
      where user_id = moi.uid
        and coalesce(source, 'serveur') <> 'appareil'
        and created_at > coalesce((select t from dernier), timestamptz '-infinity')),
    (select titre from erreur),
    (select detail from erreur),
    (select last_seen from erreur),
    (select occurrences from erreur);
$function$;
