-- Une session qui réserve un chantier puis relâche sans l'avoir fini le
-- laissait bloqué en "in_progress" pour toujours : claim_dev_item pose ce
-- statut, mais release_dev_item n'effaçait que la réservation, jamais le
-- statut. Mesuré le 6 sept. 2026 : 16 chantiers sur 63 affichaient "en cours"
-- sans personne dessus, deux depuis 58 heures — exactement ce que Raphaël
-- reprochait le 5 sept. ("je ne sais pas ce qui avance, ce qui n'avance pas").
--
-- Choix retenu (option a de la note du chantier fcced58e) : au relâchement
-- d'un chantier non archivé encore à "in_progress", on le remet à "todo".
-- Le "à moitié fait" ne se lit plus dans un statut qui ment, mais dans la
-- note du chantier — c'est là qu'une session doit l'écrire avant de partir.

create or replace function public.release_dev_item(p_item uuid, p_session text)
returns boolean
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  libere boolean;
begin
  update dev_items
  set claimed_by = null,
      claimed_at = null,
      claim_expires_at = null,
      status = case when status = 'in_progress' and archived_at is null then 'todo' else status end,
      updated_at = now()
  where id = p_item
    and claimed_by = p_session
  returning true into libere;

  return coalesce(libere, false);
end;
$function$;

-- Rattrapage ponctuel : les chantiers déjà coincés en "in_progress" sans
-- réservation vivante et sans être archivés. Un seul geste, pas une session
-- par chantier.
update dev_items
set status = 'todo', updated_at = now()
where status = 'in_progress'
  and archived_at is null
  and (claimed_by is null or claim_expires_at < now());
