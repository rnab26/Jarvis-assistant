-- Lien direct depuis une notification push « chantier livré » (chantiers
-- 04d2fa9e, 332d87fd, f613211c — le même besoin : « depuis une notification
-- ou un message, arriver directement dessus, déjà déplié »).
--
-- Le trigger n'envoyait à push-notifier que les TITRES des chantiers livrés
-- (migration 0032) : impossible d'y construire une route précise, faute
-- d'identifiant. On agrège maintenant aussi les ids, dans le même ordre que
-- les titres — push-notifier route vers `/cockpit?chantier=<id>` quand un
-- seul chantier est livré, et vers `/cockpit` (sans cible) quand plusieurs le
-- sont d'un coup : il n'y a alors pas UN endroit précis à proposer.

create or replace function public.notifier_push_chantiers_livres()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_titres text[];
  v_ids uuid[];
  v_user_id uuid;
begin
  select array_agg(n.title order by n.archived_at),
         array_agg(n.id order by n.archived_at),
         (array_agg(n.user_id))[1]
    into v_titres, v_ids, v_user_id
  from nouveaux n
  join anciens o on o.id = n.id
  where n.archived_at is not null
    and o.archived_at is null
    -- Le filtre posé le 7 sept. (migration 0032) : seulement ce qu'il a
    -- suivi de ses propres mots.
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
    'titres', v_titres,
    'ids', v_ids
  ));
  return null;
end;
$fn$;
