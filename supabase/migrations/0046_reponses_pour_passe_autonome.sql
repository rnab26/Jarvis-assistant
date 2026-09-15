-- UNE RÉPONSE DE RAPHAËL DOIT RÉVEILLER LE TRAVAIL, PAS ATTENDRE QU'IL LE DISE.
--
-- Sa phrase du 15 sept. 2026 : « J'ai répondu dans l'application jarvis faut
-- que tu sois au courant quand je réponds ».
--
-- CE QUI EXISTAIT, ET POURQUOI ÇA NE SUFFIT PAS. Ses réponses sont durables
-- (`dev_log`, `kind = 'reponse'`, et `answered_at` posé sur la question), et le
-- hook de démarrage les injecte dans CHAQUE NOUVELLE session. Mais une session
-- déjà ouverte ne les voit jamais, et la passe autonome — le seul mécanisme qui
-- réveille une session tout seul — ne regardait QUE les chantiers `[LIBRE]`.
--
-- MESURÉ le 15 sept. : il a répondu à trois questions entre 17:49 et 17:54. La
-- dernière passe datait de 12:19 et s'était retirée en `rien_a_prendre`. La
-- suivante se serait retirée pareil, et ses trois réponses seraient restées
-- là sans que rien ne bouge — parce qu'elles débloquent des chantiers
-- `[À CADRER]`, que la passe refuse de prendre par construction.
--
-- CE QU'ON NE FAIT PAS, ET C'EST VOLONTAIRE : on ne lève pas le garde-fou du
-- `[LIBRE]`. Il existe pour qu'une session ouverte par un déclencheur ne code
-- pas un sujet qu'il voulait trancher d'abord. Une RÉPONSE de sa part est
-- justement la chose que ce garde-fou attendait — mais c'est une session qui
-- la lit et qui décide, pas une règle SQL.
--
-- LE SIGNAL EST `answered_at`, posé par l'app quand il répond. On rend les
-- réponses postérieures à la DERNIÈRE PASSE TERMINÉE : ni un compteur à tenir,
-- ni une colonne de plus, et une passe qui plante ne perd rien — la suivante
-- reverra la même réponse.

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
                              and r.item_id is not distinct from q.item_id
                              and r.created_at >= q.answered_at - interval '5 seconds'
                            order by r.created_at limit 1))
             order by q.answered_at)
        from public.dev_log q
       where q.kind = 'question'
         and q.answered_at is not null
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
