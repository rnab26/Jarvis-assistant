-- Ce qui marche : ce que Raphaël a CONFIRMÉ, pour qu'aucune session ne le casse.
--
-- Chantiers 56b1a074, 6af9c51b et c2fd0205, 23 sept. 2026. Trois demandes du
-- même matin, qui sont les deux moitiés d'une même boucle :
--
-- 1. 56b1a074 — « Impossible de répondre aux chantiers "à constater" dans le
--    cockpit, contrairement à ce qui est prévu pour les sessions Claude Code.
--    Je peux seulement cliquer et voir l'historique. »
-- 2. 6af9c51b — « Savoir bien mémoriser lorsqu'on signale que quelque chose
--    fonctionne bien pour ne pas régresser si des modifications sont faites.
--    Le noter et se référer à ça pour évoluer. »
-- 3. c2fd0205 — « Quand je dis à Jarvis que tout se passe bien ou qu'il a bien
--    accompli une tâche, la mémoire doit s'entraîner en continuant à aller
--    dans ce sens et notifier ce qui est bon et mauvais […] pour que lorsque
--    Claude travaille il sait dans quelle direction aller. »
--
-- Le registre des erreurs (0019) gardait ce qui RATE. Rien ne gardait ce qui
-- MARCHE : une confirmation de sa part (« Ca marche tres bien », 17 sept.,
-- chantier 93f6ee23) restait une ligne de journal que le hook de démarrage
-- oublie au bout de douze réponses, et le chantier n'était même pas archivé.
--
-- MÊME FORME QUE jarvis_erreurs, exprès : une empreinte de regroupement, un
-- compteur, la première et la dernière fois. Dix « parfait » après une tâche
-- créée font UNE ligne qui dit « dix fois », pas dix lignes qu'on ne lit pas.

create table if not exists public.ce_qui_marche (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  -- 'cockpit' : il a appuyé sur « Ça marche » sur un chantier à constater.
  -- 'voix' : il l'a dit à Jarvis juste après une action (src/lib/retours.ts).
  source text not null check (source in ('cockpit', 'voix')),
  -- Le chantier constaté. PAS de clé étrangère en cascade : la trace doit
  -- survivre à la suppression du chantier, comme dev_items_supprimes (0038).
  item_id uuid,
  titre text not null,
  -- Ses mots, tels quels. C'est ce qui sert à la session suivante.
  paroles text,
  -- Ce que Jarvis venait de faire (voix) — la preuve, comme dans le registre.
  contexte text,
  empreinte text not null,
  occurrences integer not null default 1,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  unique (user_id, empreinte)
);

alter table public.ce_qui_marche enable row level security;

drop policy if exists ce_qui_marche_select_own on public.ce_qui_marche;
create policy ce_qui_marche_select_own on public.ce_qui_marche
  for select using ((select auth.uid()) = user_id);
drop policy if exists ce_qui_marche_insert_own on public.ce_qui_marche;
create policy ce_qui_marche_insert_own on public.ce_qui_marche
  for insert with check ((select auth.uid()) = user_id);
drop policy if exists ce_qui_marche_update_own on public.ce_qui_marche;
create policy ce_qui_marche_update_own on public.ce_qui_marche
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists ce_qui_marche_delete_own on public.ce_qui_marche;
create policy ce_qui_marche_delete_own on public.ce_qui_marche
  for delete using ((select auth.uid()) = user_id);

create index if not exists ce_qui_marche_recent on public.ce_qui_marche (user_id, last_seen desc);

-- En direct, comme tout le reste du cockpit (chantier e687f0e2).
alter table public.ce_qui_marche replica identity full;
do $$
begin
  alter publication supabase_realtime add table public.ce_qui_marche;
exception when duplicate_object then null;
end $$;

-- ── Noter une confirmation ────────────────────────────────────────────────
-- Le SEUL chemin d'écriture, comme signaler_erreur pour le registre : deux
-- écritures côté app finiraient par ne plus calculer la même empreinte.
create or replace function public.noter_ce_qui_marche(
  p_source text,
  p_titre text,
  p_paroles text default null,
  p_contexte text default null,
  p_item uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_titre text := left(regexp_replace(trim(coalesce(p_titre, '')), '\s+', ' ', 'g'), 200);
  v_empreinte text;
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Non connecté';
  end if;
  if v_titre = '' then
    raise exception 'Titre vide';
  end if;

  -- Un chantier constaté se range sur son id (son titre peut être renommé) ;
  -- une confirmation à la voix, sur la famille d'action et sa cible.
  v_empreinte := p_source || ':' || coalesce(p_item::text, lower(v_titre));

  insert into public.ce_qui_marche (user_id, source, item_id, titre, paroles, contexte, empreinte)
  values (
    auth.uid(), p_source, p_item, v_titre,
    nullif(left(trim(coalesce(p_paroles, '')), 1000), ''),
    nullif(left(trim(coalesce(p_contexte, '')), 1000), ''),
    v_empreinte
  )
  on conflict (user_id, empreinte) do update set
    occurrences = public.ce_qui_marche.occurrences + 1,
    last_seen = now(),
    titre = excluded.titre,
    paroles = coalesce(excluded.paroles, public.ce_qui_marche.paroles),
    contexte = coalesce(excluded.contexte, public.ce_qui_marche.contexte)
  returning id into v_id;

  return v_id;
end;
$$;

-- ── Répondre sur un chantier « à constater » ─────────────────────────────
-- Tout d'un bloc, et c'est le point : archivé sans la trace de sa réponse, ou
-- sa réponse écrite sans que le chantier bouge, c'est exactement le défaut
-- qu'il signale dans fa209b63 (« les chantiers ne sont pas mis à jour »).
--
-- Les NOUVELLES NOTES sont calculées côté app (src/lib/constatChantier.ts) :
-- le marqueur se lit en TypeScript, jamais en SQL (CLAUDE.md, sessions
-- autonomes). La base vérifie seulement que la note n'a pas bougé depuis que
-- l'écran l'a lue — sinon on écraserait ce qu'une session vient d'écrire,
-- le défaut que 0027 existe pour rattraper.
create or replace function public.constater_chantier(
  p_item uuid,
  p_marche boolean,
  p_paroles text,
  p_photo text,
  p_notes_avant text,
  p_notes_apres text
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v public.dev_items%rowtype;
  v_log uuid;
  v_marche uuid := null;
  v_paroles text := nullif(trim(coalesce(p_paroles, '')), '');
begin
  select * into v from public.dev_items where id = p_item for update;
  if not found then
    raise exception 'Chantier introuvable';
  end if;
  if v.archived_at is not null then
    raise exception 'Ce chantier est déjà archivé.';
  end if;
  if coalesce(v.notes, '') is distinct from coalesce(p_notes_avant, '') then
    raise exception 'Une session vient de modifier ce chantier : ferme-le, rouvre-le, et réessaie.';
  end if;
  if not p_marche and v_paroles is null then
    raise exception 'Dis ce qui ne marche pas : sans ça, la session ne sait pas quoi reprendre.';
  end if;

  -- Son propre constat ne doit pas lui revenir en notification « chantier
  -- livré » : c'est lui qui vient de l'archiver.
  perform set_config('jarvis.constat_par_raphael', '1', true);

  update public.dev_items
  set notes = p_notes_apres,
      status = case when p_marche then 'done' else 'todo' end,
      archived_at = case when p_marche then now() else null end,
      updated_at = now()
  where id = p_item;

  insert into public.dev_log (user_id, item_id, author, kind, body, photo_chemin)
  values (
    v.user_id, p_item, 'Raphaël', 'reponse',
    case when p_marche then 'Ça marche' else 'Ça ne marche pas' end
      || ' — constaté sur son téléphone, depuis le chantier « ' || v.title || ' ».'
      || coalesce(E'\n' || v_paroles, ''),
    p_photo
  )
  returning id into v_log;

  if p_marche then
    v_marche := public.noter_ce_qui_marche('cockpit', v.title, v_paroles, null, p_item);
  end if;

  return jsonb_build_object('log_id', v_log, 'marche_id', v_marche);
end;
$$;

-- ── Annuler, dans les huit secondes du toast ─────────────────────────────
-- Le même « Annuler » que partout dans le cockpit (src/lib/annulation.ts).
-- Il défait les TROIS écritures : laisser la réponse « Ça marche » dans le
-- journal après l'avoir annulée ferait mentir le bloc de démarrage des
-- sessions.
create or replace function public.annuler_constat(
  p_item uuid,
  p_notes text,
  p_status text,
  p_archived_at timestamptz,
  p_log uuid,
  p_marche uuid
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  perform set_config('jarvis.constat_par_raphael', '1', true);

  update public.dev_items
  set notes = p_notes, status = p_status, archived_at = p_archived_at, updated_at = now()
  where id = p_item;

  delete from public.dev_log where id = p_log and author = 'Raphaël';

  if p_marche is not null then
    update public.ce_qui_marche
    set occurrences = occurrences - 1
    where id = p_marche and occurrences > 1;
    if not found then
      delete from public.ce_qui_marche where id = p_marche;
    end if;
  end if;
end;
$$;

-- ── La notification « chantier livré » se tait sur son propre constat ────
-- Même fonction que 0032, une ligne de plus en tête.
create or replace function public.notifier_push_chantiers_livres()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_titres text[];
  v_ids uuid[];
  v_user_id uuid;
begin
  -- Posé par constater_chantier / annuler_constat : c'est Raphaël qui vient
  -- d'archiver, lui dire « livré » serait lui répéter son propre geste.
  if coalesce(current_setting('jarvis.constat_par_raphael', true), '') = '1' then
    return null;
  end if;

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
$function$;
