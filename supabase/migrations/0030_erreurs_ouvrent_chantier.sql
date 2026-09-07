-- Une erreur de compréhension ou d'action vue deux fois ouvre son chantier
-- toute seule, au lieu d'attendre qu'une session la remarque dans le bloc de
-- démarrage.
--
-- POURQUOI MAINTENANT. Raphaël, 6 sept. 2026 au soir : « avancer sur le mode
-- auto-entraînement [...] le correctif général de Jarvis où il s'entraîne par
-- rapport à toutes ses erreurs. » Deux chantiers dormaient déjà sur exactement
-- ça, tous deux répondus, aucun codé :
--
--   - 25a58902 (Auto-audit, livré en partie le 6 sept.) a fait la DÉTECTION
--     (jarvis_erreurs, occurrences, empreinte) mais s'est arrêté avant la
--     création automatique — la question posée dans dev_log (a4b13efb) sur
--     "faut-il ouvrir un chantier tout seul" a été tranchée OUI (réponse
--     5590702f, au nom de Raphaël, citant sa consigne du 3 sept. : « tout bug
--     que tu découvres sans le corriger doit exister comme une ligne de
--     dev_items ouverte ») — à partir de DEUX occurrences, un seul chantier
--     par empreinte, jamais de notification, note marquée en tête, et
--     seulement les catégories comprehension/action (une panne serveur ou
--     système répétée n'apprend rien sous forme de chantier, elle a déjà sa
--     ligne dans le registre).
--   - bf07d25b (RÉPONDU 5 sept.) demande que ce chantier "passe en tête" —
--     priorité haute, pas de tâche planifiée, pas de sondage périodique.
--
-- D'OÙ LE CHOIX D'ACCROCHER ÇA À signaler_erreur() ET PAS À UN CRON : c'est le
-- seul chemin d'écriture du registre, déjà appelé à chaque échec réel (retours
-- constatés par MicButton, échecs Live, saisie manuelle) — même raison que
-- moteur-veille et purger_echanges, réveillés paresseusement plutôt que par
-- pg_cron/pg_net, qu'on n'installe pas (choix de sécurité de Raphaël).
--
-- UNE ERREUR CORRIGÉE QUI REVIENT RÉOUVRE SON CHANTIER, PAS UN SECOND. La
-- table jarvis_erreurs rouvre déjà elle-même (statut repasse à 'nouveau',
-- reapparue_at posée) quand une erreur qu'on croyait réglée ressurgit. Si le
-- chantier lié avait été archivé entre-temps, il est légitime qu'il revienne
-- ouvert : un correctif qui a régressé n'est plus fini.
create or replace function public.signaler_erreur(
  p_categorie text,
  p_titre text,
  p_detail text default null,
  p_contexte text default null,
  p_source text default 'app'
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  cat text := coalesce(nullif(trim(p_categorie), ''), 'autre');
  titre text := left(trim(coalesce(p_titre, '')), 200);
  v_erreur jarvis_erreurs%rowtype;
  v_chantier dev_items%rowtype;
  v_reapparue boolean;
  v_note_creation text;
  v_note_ajout text;
begin
  if titre = '' then
    return null;
  end if;
  if cat not in ('comprehension','action','ecoute','serveur','systeme','utilisation','autre') then
    cat := 'autre';
  end if;

  insert into jarvis_erreurs (categorie, titre, detail, contexte, source, empreinte)
  values (cat, titre, left(p_detail, 2000), left(p_contexte, 1000),
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
$$;
