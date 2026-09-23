-- « RÉPONSE DE RAPHAËL » NE DOIT DIRE QUE CE QUE RAPHAËL A ÉCRIT.
--
-- Trouvé le 23 sept. 2026 en réparant le verdict `il_a_repondu` (migration
-- 0057) : à son tout premier passage réussi, la passe m'a présenté quatre
-- « RÉPONSE DE RAPHAËL » dont DEUX avaient été écrites par une autre session
-- Claude. La sous-requête ne filtrait pas `author`, et le script imprime tout
-- ce qu'elle rend sous ce titre.
--
--   select author, count(*) from dev_log where kind = 'reponse' group by author;
--     Raphaël 47 | claude/verify-sql-auto-access 7 | claude/new-session-rn6puh 5
--     claude/economie-0904 2 | claude/documents-migration-backfill 1
--
-- 15 réponses sur 62, soit une sur quatre, venaient d'une session.
--
-- CE N'EST PAS UN DÉTAIL D'AFFICHAGE. L'une des deux disait, mot pour mot :
-- « Oui, vas-y : ajouter une sonde native [...] pas besoin d'en discuter avec
-- Raphael avant de coder » — sur le chantier 3840996e, qui porte
-- [À CADRER AVEC RAPHAËL AVANT DE COMMENCER] et touche un sujet qu'une
-- session autonome ne prend jamais. Une session qui lit ça comme une
-- autorisation de Raphaël code un sujet réservé sur la foi d'un texte qu'il
-- n'a jamais écrit. Le garde-fou du [LIBRE] ne sert à rien si on peut
-- s'autoriser soi-même par le journal.
--
-- LE FILTRE EST UNE ÉGALITÉ, PAS UNE EXCLUSION DE PRÉFIXE. Écarter
-- « claude/% » laisserait passer n'importe quel autre nom de branche ; exiger
-- `author = 'Raphaël'` ne laisse passer que ce que l'app écrit quand c'est
-- LUI qui répond (47 entrées depuis le 5 sept.). Si l'app changeait un jour
-- cette valeur, la passe se tairait au lieu de parler en son nom — c'est le
-- bon sens de panne.
--
-- Et une question refermée par une session, sans réponse de lui, ne compte
-- plus du tout : sinon la passe annonce « Raphaël a répondu à 4 questions »
-- alors qu'il n'en a répondu aucune.

create or replace function public.etat_pour_passe_autonome()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'reglage', (select r.valeurs ->> 'jarvis_sessions_autonomes'
                  from public.reglages r
                 where r.user_id = public.proprietaire_du_cockpit()),
    'maintenant', now(),
    'reservations', coalesce((
      select jsonb_agg(jsonb_build_object('branche', i.claimed_by, 'titre', i.title,
                                          'expire', i.claim_expires_at))
        from public.dev_items i
       where i.archived_at is null
         and i.claimed_by is not null
         and i.claim_expires_at > now()), '[]'::jsonb),
    'passes_ouvertes', coalesce((
      select jsonb_agg(jsonb_build_object('branche', p.branche, 'demarre_at', p.demarre_at))
        from public.passes_autonomes p
       where p.fini_at is null), '[]'::jsonb),
    -- Ce qu'il a répondu depuis la dernière passe TERMINÉE. La question porte
    -- le `answered_at` ; la réponse elle-même est l'entrée `reponse` qui suit,
    -- sur le même chantier. On rend les deux : la question dit de quoi on
    -- parle, la réponse dit ce qu'il a choisi.
    'reponses', coalesce((
      select jsonb_agg(jsonb_build_object(
               'question', q.body, 'item_id', q.item_id, 'answered_at', q.answered_at,
               'reponse', (select r.body from public.dev_log r
                            where r.kind = 'reponse'
                              and r.author = 'Raphaël'
                              and r.item_id is not distinct from q.item_id
                              and r.created_at >= q.answered_at - interval '5 seconds'
                            order by r.created_at limit 1))
             order by q.answered_at)
        from public.dev_log q
       where q.kind = 'question'
         and q.answered_at is not null
         and exists (select 1 from public.dev_log r
                      where r.kind = 'reponse'
                        and r.author = 'Raphaël'
                        and r.item_id is not distinct from q.item_id
                        and r.created_at >= q.answered_at - interval '5 seconds')
         and q.answered_at > coalesce(
               (select max(p.fini_at) from public.passes_autonomes p where p.fini_at is not null),
               now() - interval '7 days')), '[]'::jsonb),
    'chantiers', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', i.id, 'title', i.title, 'notes', i.notes, 'status', i.status,
               'priority', i.priority, 'theme', i.theme,
               'claimed_by', i.claimed_by, 'claim_expires_at', i.claim_expires_at,
               'archived_at', i.archived_at, 'created_at', i.created_at)
             order by (i.priority = 'high') desc, i.created_at)
        from public.dev_items i
       where i.archived_at is null and i.status <> 'done'), '[]'::jsonb)
  );
$$;
