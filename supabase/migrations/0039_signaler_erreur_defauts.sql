-- 0039 — signaler_erreur() : régression trouvée en déployant la migration 0038.
--
-- CE QUI S'EST PASSÉ, vérifié pas supposé. `scripts/verifier-sections-erreurs.mjs`
-- appelle `signaler_erreur` SANS `p_contexte` (« {p_categorie, p_titre,
-- p_detail, p_source} »). Ce paramètre n'avait pourtant AUCUN défaut dans le
-- fichier de migration 0031 — le dernier commis en dépôt avant celui-ci. Or ce
-- même appel marchait avant la 0038 (reproduit avec la fonction fraîchement
-- réécrite : PostgREST répond 404 « no matches found », il exige que tout
-- paramètre sans défaut soit nommé). La seule explication : le `p_contexte`
-- de la fonction RÉELLEMENT EN BASE portait déjà un défaut, posé directement
-- (comme la table `dev_items_supprimes`, trouvée dans la foulée — même
-- famille de dérive : du DDL appliqué en base sans jamais être poussé en
-- migration). La migration 0038 a recréé la fonction depuis le dernier
-- fichier connu (0031) et a donc fait régresser cette tolérance sans le
-- savoir.
--
-- LA RÈGLE, pour ne pas reproduire l'erreur : avant de réécrire une fonction
-- avec `create or replace`, relire sa VRAIE définition en base
-- (`pg_get_functiondef`) plutôt que de partir du dernier fichier de
-- migration — les deux peuvent diverger, et rien ne le signale.
--
-- LE CORRECTIF : tous les paramètres sauf `p_categorie` et `p_titre`
-- deviennent optionnels, avec un défaut `null` qui correspond exactement à ce
-- que le corps de la fonction fait déjà (`coalesce(nullif(trim(p_source),
-- ''), 'app')`, `left(p_detail, 2000)` sur une valeur nulle rend `null`, etc.)
-- — aucun comportement ne change pour les appelants qui passent déjà tout.
-- Signature inchangée (mêmes noms, mêmes types, même ordre) : un simple
-- `create or replace` suffit, pas de DROP.

create or replace function public.signaler_erreur(
  p_categorie text,
  p_titre text,
  p_detail text default null,
  p_contexte text default null,
  p_source text default null,
  p_user_id uuid default null,
  p_correction_suggeree text default null
) returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $fn$
declare
  cat text := coalesce(nullif(trim(p_categorie), ''), 'autre');
  titre text := left(trim(coalesce(p_titre, '')), 200);
  v_suggestion text := nullif(trim(coalesce(p_correction_suggeree, '')), '');
  v_erreur jarvis_erreurs%rowtype;
  v_chantier dev_items%rowtype;
  v_reapparue boolean;
  v_note_creation text;
  v_note_ajout text;
  v_user uuid := coalesce(p_user_id, auth.uid());
begin
  if titre = '' then
    return null;
  end if;
  if cat not in ('comprehension','action','ecoute','serveur','systeme','utilisation','autre') then
    cat := 'autre';
  end if;

  if v_user is null then
    return null;
  end if;

  insert into jarvis_erreurs (user_id, categorie, titre, detail, contexte, source, empreinte, correction_suggeree)
  values (v_user, cat, titre, left(p_detail, 2000), left(p_contexte, 1000),
          coalesce(nullif(trim(p_source), ''), 'app'), empreinte_erreur(cat, titre), left(v_suggestion, 300))
  on conflict (user_id, empreinte) do update
  set occurrences = jarvis_erreurs.occurrences + 1,
      last_seen = now(),
      updated_at = now(),
      detail = coalesce(left(excluded.detail, 2000), jarvis_erreurs.detail),
      contexte = coalesce(left(excluded.contexte, 1000), jarvis_erreurs.contexte),
      statut = case when jarvis_erreurs.statut in ('corrige','ignore') then 'nouveau'
                    else jarvis_erreurs.statut end,
      reapparue_at = case when jarvis_erreurs.statut in ('corrige','ignore') then now()
                          else jarvis_erreurs.reapparue_at end,
      correction_suggeree = case
        when coalesce(trim(jarvis_erreurs.correction), '') <> '' then jarvis_erreurs.correction_suggeree
        else coalesce(excluded.correction_suggeree, jarvis_erreurs.correction_suggeree)
      end
  returning * into v_erreur;

  if v_erreur.categorie not in ('comprehension', 'action') then
    return v_erreur.id;
  end if;

  if v_erreur.dev_item_id is null then
    if v_erreur.occurrences < 2
       or coalesce(trim(v_erreur.correction), '') <> '' then
      return v_erreur.id;
    end if;

    v_note_creation := '[OUVERT AUTOMATIQUEMENT PAR JARVIS] Repéré ' || v_erreur.occurrences
      || ' fois, du ' || to_char(v_erreur.first_seen, 'DD/MM à HH24:MI')
      || ' au ' || to_char(v_erreur.last_seen, 'DD/MM à HH24:MI') || '.'
      || coalesce(chr(10) || chr(10) || 'Contexte : ' || v_erreur.contexte, '')
      || coalesce(chr(10) || chr(10) || 'Détail : ' || v_erreur.detail, '')
      || chr(10) || chr(10)
      || 'Ouvert tout seul (voir 25a58902 et bf07d25b) : '
      || 'une erreur de catégorie ' || v_erreur.categorie || ' vue au moins deux fois, '
      || 'sans correction écrite dans le registre. Corrige la cause, ou si ce n''en '
      || 'est pas une, marque l''erreur correspondante « ignore » dans jarvis_erreurs '
      || '(elle ne rouvrira pas ce chantier).';

    insert into dev_items (user_id, title, notes, status, priority, theme)
    values (v_erreur.user_id, v_erreur.titre, v_note_creation, 'todo', 'high', 'Ce qu''il me signale')
    returning * into v_chantier;

    update jarvis_erreurs set dev_item_id = v_chantier.id, updated_at = now()
    where id = v_erreur.id;
  else
    select * into v_chantier from dev_items where id = v_erreur.dev_item_id;
    if not found then
      return v_erreur.id;
    end if;

    v_reapparue := v_chantier.archived_at is not null and v_erreur.reapparue_at is not null
      and v_erreur.reapparue_at >= now() - interval '1 second';

    v_note_ajout := chr(10) || chr(10)
      || '[JARVIS, ' || to_char(now(), 'DD/MM à HH24:MI') || '] '
      || case when v_reapparue
              then 'Cette erreur avait été marquée réglée, elle revient : ' || v_erreur.occurrences || 'e occurrence, '
              else v_erreur.occurrences || 'e occurrence, ' end
      || 'la dernière le ' || to_char(v_erreur.last_seen, 'DD/MM à HH24:MI') || '.'
      || coalesce(chr(10) || 'Contexte : ' || v_erreur.contexte, '')
      || coalesce(chr(10) || 'Détail : ' || v_erreur.detail, '');

    if v_reapparue then
      update dev_items
      set notes = notes || v_note_ajout, status = 'todo', archived_at = null
      where id = v_chantier.id;
    else
      update dev_items
      set notes = notes || v_note_ajout
      where id = v_chantier.id;
    end if;
  end if;

  return v_erreur.id;
end;
$fn$;
