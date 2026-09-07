-- 0032 — ne notifier « chantier livré » que pour les chantiers où RAPHAËL a répondu.
--
-- SON CHOIX, 7 sept. 2026, après que les trois options lui ont été présentées :
-- « vas-y pour A + C ». C est « une notification quand un chantier sur lequel
-- j'ai répondu est livré » — pas tous les chantiers.
--
-- POURQUOI CE FILTRE EST LA CONDITION DE L'OPTION, et pas un raffinement :
-- MESURÉ le 7 sept. sur ses données réelles, sur sept jours glissants —
--   195 chantiers archivés au total, soit ~28 notifications par jour ;
--     7 chantiers archivés où il avait répondu, soit ~1 par jour.
-- Sans le filtre, rallumer son interrupteur le noierait, et une notification
-- qui sonne trente fois par jour n'est plus lue du tout — c'est exactement la
-- raison pour laquelle il avait COUPÉ ce réglage.
--
-- CE QUE ÇA CHANGE AU SENS DE SON INTERRUPTEUR « chantier livré » : il ne veut
-- plus dire « tous », il veut dire « ceux que j'ai suivis ». C'est écrit dans
-- la carte de Paramètres, et c'est ce qu'il a demandé.
--
-- LE PRÉDICAT EST « il a écrit une réponse sur ce chantier » (dev_log,
-- kind = 'reponse', author « Raphaël »). C'est le geste par lequel il montre
-- qu'il suit un chantier — le même que celui du cockpit, pas une notion neuve.

create or replace function public.notifier_push_chantiers_livres()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_titres text[];
  v_user_id uuid;
begin
  select array_agg(n.title order by n.archived_at), (array_agg(n.user_id))[1]
    into v_titres, v_user_id
  from nouveaux n
  join anciens o on o.id = n.id
  where n.archived_at is not null
    and o.archived_at is null
    -- Le filtre : seulement ce qu'il a suivi de ses propres mots.
    and exists (
      select 1 from public.dev_log l
      where l.item_id = n.id
        and l.kind = 'reponse'
        and l.author ilike 'rapha%'
    );

  if v_titres is null or array_length(v_titres, 1) = 0 then
    return null;
  end if;

  perform public.appeler_push_notifier(jsonb_build_object(
    'type', 'chantiers_livres',
    'user_id', v_user_id,
    'titres', v_titres
  ));
  return null;
end;
$fn$;
