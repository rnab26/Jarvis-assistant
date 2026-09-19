-- Fusionner deux chantiers en un seul.
--
-- POURQUOI (chantier 38dad5ad, dicté le 17 sept. 2026) : « Developpement pour
-- que jarvis puisse fusionner des chantiers sur demande ». Deux chantiers qui
-- disent la même chose (dictés à des moments différents, avec des mots
-- différents — la détection de doublons `doublonsExistants.ts` ne les
-- rapproche pas toujours) cohabitent aujourd'hui pour de bon : ni l'app ni le
-- cockpit n'offrent de moyen de les réunir. La seule issue manuelle est
-- d'archiver l'un des deux et de recopier ses notes à la main dans l'autre —
-- ce qui perd la trace du geste et le rattachement de sa conversation.
--
-- MODÈLE : `fusionner_sections` (migration 0018), pour les mêmes raisons —
-- une requête, jamais un aller-retour par chantier, et RLS + `security
-- invoker` suffisent à garder chacun dans ses propres chantiers plutôt que
-- d'ajouter une vérification de propriété redondante.
--
-- CE QUI DIFFÈRE D'UNE SECTION : un chantier porte des NOTES écrites par
-- plusieurs sessions au fil du temps (« un chantier garde ce qu'on y a
-- écrit », migration 0027) et sa PROPRE conversation dans `dev_log`
-- (migration 0048, `dev_log.item_id`). Fusionner ne doit perdre ni l'une ni
-- l'autre :
--   — les notes du chantier absorbé sont ajoutées à la suite de celles du
--     chantier qui reste, jamais écrasées ni résumées ;
--   — les messages du journal qui portaient sur le chantier absorbé sont
--     déplacés vers celui qui reste, pour que sa conversation continue de
--     s'y lire ;
--   — la priorité retenue est la PLUS HAUTE des deux : fusionner ne doit
--     jamais faire redescendre silencieusement une urgence.
--
-- LE CHANTIER SOURCE EST SUPPRIMÉ, PAS ARCHIVÉ : un chantier fusionné n'est
-- pas « livré », le laisser dans les archivés mentirait sur ce qui s'est
-- passé. Le DELETE reste tracé par le trigger de la migration 0038
-- (`dev_items_supprimes`) : une fusion qui se révèle être une erreur reste
-- réparable par `restaurer_chantier_supprime`, exactement comme n'importe
-- quelle autre suppression du cockpit.
create or replace function fusionner_dev_items(p_source uuid, p_cible uuid)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_source dev_items%rowtype;
  v_cible dev_items%rowtype;
  v_notes text;
  v_priorite text;
  touches integer;
begin
  if p_source = p_cible then
    raise exception 'Un chantier ne peut pas se fusionner avec lui-même';
  end if;

  select * into v_source from dev_items where id = p_source;
  if not found then
    raise exception 'Chantier source introuvable';
  end if;

  select * into v_cible from dev_items where id = p_cible;
  if not found then
    raise exception 'Chantier cible introuvable';
  end if;

  v_notes := coalesce(v_cible.notes, '')
    || case when coalesce(trim(v_cible.notes), '') <> '' then E'\n\n---\n' else '' end
    || 'Fusionné avec « ' || v_source.title || ' » le '
    || to_char(now(), 'DD/MM/YYYY') || ' :' || E'\n'
    || coalesce(nullif(trim(v_source.notes), ''), '(sans notes)');

  -- low < normal < high — la fusion ne doit jamais faire redescendre une
  -- urgence en silence.
  v_priorite := case
    when 'high' in (v_cible.priority, v_source.priority) then 'high'
    when 'normal' in (v_cible.priority, v_source.priority) then 'normal'
    else 'low'
  end;

  update dev_items
  set notes = v_notes, priority = v_priorite, updated_at = now()
  where id = p_cible;

  -- La conversation du chantier absorbé continue de se lire sur celui qui
  -- reste, plutôt que de disparaître avec lui.
  update dev_log set item_id = p_cible where item_id = p_source;
  get diagnostics touches = row_count;

  -- Tracé par le trigger BEFORE DELETE de la migration 0038 : une fusion qui
  -- se révèle être une erreur reste réparable.
  delete from dev_items where id = p_source;

  return touches;
end;
$$;
