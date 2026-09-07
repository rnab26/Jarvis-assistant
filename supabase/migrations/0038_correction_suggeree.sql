-- Préférences et corrections apprises automatiquement (chantier 89c3ceca).
--
-- LA MOITIÉ « toi-preferences » DU QUESTIONNAIRE (« Jarvis, pièce par pièce »,
-- réponse « oui », 2 sept. 2026 : « Un fichier central de tes préférences,
-- alimenté tout seul ») est déjà livrée par la mémoire longue durée
-- (`memoire.ts`, catégorie souvenirs « preference ») : chaque échange est déjà
-- passé au crible pour en tirer ses préférences, sans qu'il ait jamais rien à
-- remplir à la main. Rien à ajouter ici.
--
-- CE QUI RESTE : « toi-corrections » — « Qu'il apprenne quand tu le reprends :
-- "Non, pas comme ça" devient une règle retenue, au lieu d'une correction à
-- refaire la semaine suivante. » Aujourd'hui `jarvis_erreurs.correction` (donc
-- ce qui atteint le modèle, via `_shared/corrections.ts`) est TOUJOURS tapé à
-- la main par Raphaël dans le cockpit — même quand il vient de dicter, dans la
-- même phrase, exactement ce qu'il fallait faire.
--
-- LE COMPROMIS DE SÉCURITÉ, tranché ici plutôt que reposé à Raphaël, parce
-- qu'il suit exactement le même principe que « Ça existe déjà » (doublons) et
-- « Un thème sans section » : ON PROPOSE, ON N'APPLIQUE JAMAIS TOUT SEUL. Une
-- règle qui changerait ce que Jarvis dit ou fait à toutes ses phrases
-- suivantes, à partir d'une phrase reconnue automatiquement (donc faillible),
-- serait exactement le défaut qu'on a déjà payé avec « Jarvis appelle mail »
-- ou WhatsApp Business — sauf que là, l'erreur s'installerait durablement dans
-- la consigne au lieu de rater un seul appel.
--
-- `correction_suggeree` est donc une colonne SÉPARÉE de `correction`.
-- `_shared/corrections.ts` ne lit et n'a jamais lu que `correction` : une
-- suggestion n'atteint le modèle qu'après avoir été recopiée dedans, d'un tap
-- depuis le cockpit (bouton « Adopter »).

alter table public.jarvis_erreurs
  add column if not exists correction_suggeree text;

comment on column public.jarvis_erreurs.correction_suggeree is
  'Candidat de correction detecte automatiquement (retours.ts#correctionDite) a partir de ce que Raphael vient de dire. Ne part JAMAIS au modele tel quel : _shared/corrections.ts ne lit que `correction`. Un tap sur "Adopter" dans le cockpit le recopie dans `correction` ; "Ecarter" le vide sans rien adopter.';

-- Le paramètre est ajouté en dernier, avec un défaut : les appelants
-- existants (cinq ou six arguments nommés) ne changent pas. Un ajout de
-- paramètre CRÉE UNE SURCHARGE avec `create or replace` — d'où le DROP
-- d'abord, leçon déjà payée par la migration 0031.
drop function if exists public.signaler_erreur(text, text, text, text, text, uuid);

create or replace function public.signaler_erreur(
  p_categorie text,
  p_titre text,
  p_detail text,
  p_contexte text,
  p_source text,
  p_user_id uuid default null,
  p_correction_suggeree text default null
) returns uuid
language plpgsql
-- SECURITY INVOKER comme dans la 0031 : cette migration n'ajoute qu'un
-- paramètre et une colonne, elle ne doit rien changer d'autre au corps.
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
      -- Une correction déjà ADOPTÉE (`correction` non vide) n'a plus besoin
      -- de suggestion : on ne l'écrase jamais dans ce cas. Sinon, la nouvelle
      -- occurrence rafraîchit la suggestion — mais seulement si elle en
      -- apporte une ; un signalement sans phrase de Raphaël (une panne
      -- serveur, par exemple) ne doit pas effacer une suggestion en attente.
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
