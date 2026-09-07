-- 0031 — signaler_erreur : accepter un user_id explicite.
--
-- Numérotée 0031 et pas 0030 : une autre session a livré 0030 (« les erreurs
-- ouvrent un chantier ») pendant ce travail. Sa logique est CONSERVÉE ici —
-- ce fichier reprend le corps tel qu'il était en base et n'y ajoute que le
-- paramètre.
--
-- LE DÉFAUT, constaté le 7 sept. 2026 et pas supposé. `jarvis_erreurs.user_id`
-- est NOT NULL avec pour défaut `auth.uid()`. Toutes les fonctions qui
-- signalaient une panne portaient le jeton de Raphaël (voice-command,
-- live-jeton), donc ça marchait. `push-notifier`, elle, est appelée par
-- POSTGRES via pg_net, sans jeton utilisateur, avec la clé service_role :
-- `auth.uid()` y est NULL, l'insertion viole la contrainte, et `signalerPanne`
-- avale l'erreur par construction (un registre d'erreurs ne doit jamais faire
-- échouer ce qu'il observe).
--
-- Résultat : le 7 sept. à 12 h 17, push-notifier a bien répondu
-- « FIREBASE_SERVICE_ACCOUNT n'est pas un JSON valide » — mais RIEN n'est
-- arrivé dans le registre. La panne restait invisible pour Raphaël, ce qui
-- était précisément ce que le correctif de 06 h 30 prétendait fermer.
--
-- push-notifier connaît le user_id : elle vient de lire les jetons de cet
-- utilisateur. Elle le passe donc explicitement.
--
-- `p_user_id` est en DERNIER et a un défaut : les appelants existants, qui
-- passent les cinq paramètres par nom, ne changent pas. Et un signalement sans
-- utilisateur identifiable ne s'écrit pas plutôt que d'échouer bruyamment —
-- il n'appartiendrait à personne et n'apparaîtrait dans aucun cockpit.

-- Le DROP vient d'abord, et c'est nécessaire : ajouter un paramètre change la
-- signature, donc `create or replace` CRÉE UNE SURCHARGE au lieu de remplacer.
-- Les deux coexistent alors, et un appel à cinq arguments devient ambigu
-- (« function signaler_erreur(...) is not unique ») — ce qui casse d'un coup
-- tous les appelants existants. Constaté en l'appliquant, le 7 sept. 2026.
drop function if exists public.signaler_erreur(text, text, text, text, text);

create or replace function public.signaler_erreur(
  p_categorie text,
  p_titre text,
  p_detail text,
  p_contexte text,
  p_source text,
  p_user_id uuid default null
) returns uuid
language plpgsql
-- SECURITY INVOKER et search_path comme dans la 0030 : cette migration ne fait
-- qu'AJOUTER un paramètre, elle ne doit rien changer d'autre. Repasser en
-- « definer » élèverait les privilèges de la fonction sans que personne l'ait
-- décidé — c'est arrivé une première fois le 7 sept. 2026, corrigé aussitôt.
security invoker
set search_path = public, pg_temp
as $fn$
declare
  cat text := coalesce(nullif(trim(p_categorie), ''), 'autre');
  titre text := left(trim(coalesce(p_titre, '')), 200);
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

  -- v_user vaut auth.uid() dans l'app et pour les fonctions qui portent le
  -- jeton de Raphael (voice-command, live-jeton). Pour une fonction qui appelle
  -- avec la cle service_role, auth.uid() est NULL : c'est le cas de
  -- push-notifier, appelee par Postgres sans jeton utilisateur. Elle passe donc
  -- p_user_id, qu'elle connait deja puisqu'elle vient de lire les jetons de cet
  -- utilisateur.
  if v_user is null then
    return null;
  end if;

  insert into jarvis_erreurs (user_id, categorie, titre, detail, contexte, source, empreinte)
  values (v_user, cat, titre, left(p_detail, 2000), left(p_contexte, 1000),
          coalesce(nullif(trim(p_source), ''), 'app'), empreinte_erreur(cat, titre))
  on conflict (user_id, empreinte) do update
  set occurrences = jarvis_erreurs.occurrences + 1,
      last_seen = now(),
      updated_at = now(),
      -- Le dernier détail vu remplace l'ancien : c'est celui qu'on ira lire.
      detail = coalesce(left(excluded.detail, 2000), jarvis_erreurs.detail),
      contexte = coalesce(left(excluded.contexte, 1000), jarvis_erreurs.contexte),
      -- Une erreur qu'on croyait réglée et qui revient doit se revoir.
      statut = case when jarvis_erreurs.statut in ('corrige','ignore') then 'nouveau'
                    else jarvis_erreurs.statut end,
      reapparue_at = case when jarvis_erreurs.statut in ('corrige','ignore') then now()
                          else jarvis_erreurs.reapparue_at end
  returning * into v_erreur;

  -- SEULEMENT comprehension/action : une panne serveur ou système répétée
  -- n'apprend rien sous forme de chantier, elle a déjà sa ligne dans le
  -- registre. Ce garde-fou s'applique aux DEUX branches (création ET reprise
  -- d'un chantier existant) — une erreur système ne doit jamais toucher à un
  -- dev_item, point final.
  if v_erreur.categorie not in ('comprehension', 'action') then
    return v_erreur.id;
  end if;

  if v_erreur.dev_item_id is null then
    -- CRÉATION : seulement à partir de deux occurrences (jamais sur la
    -- première — un accident de reconnaissance vocale n'est pas encore un
    -- motif), et seulement sans correction déjà écrite : une erreur déjà
    -- diagnostiquée n'a plus besoin qu'on lui ouvre un chantier, la
    -- correction part déjà au modèle (corrections.ts).
    --
    -- CE GARDE NE VAUT QUE POUR LA CRÉATION. Une erreur qui a DÉJÀ son
    -- chantier (branche ci-dessous) peut très bien avoir une `correction`
    -- écrite ET revenir quand même — l'upsert au-dessus vient justement de la
    -- remettre à 'nouveau' dans ce cas précis (reapparue_at posé) : c'est une
    -- régression, pas un doublon à éviter, et c'est justement ce qu'il faut
    -- montrer sur le chantier.
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
    -- MISE À JOUR : le chantier existe déjà pour cette empreinte, jamais un
    -- second. On ajoute à sa note plutôt que de la réécrire, comme partout
    -- ailleurs dans ce projet.
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
