-- Les passes des sessions autonomes : ce qui s'est passé pendant ses absences.
--
-- Chantier 59d8587f. Sa réponse du 6 sept. 2026 à 00 h 05, dans l'app :
-- « Oui en continue même la journee. Éviter de lancer une session si une autre
-- en est deja en cours et est disponible pour plusieurs raison : ne pas
-- consommer trop de crédit claude code, ne pas augmenter le nombre de session
-- qui deviendrais sûrement inactive a la fin de la tâche ».
--
-- POURQUOI UNE TABLE, ET PAS `dev_log`. Le journal de bord est sa conversation
-- avec les sessions, et le hook de démarrage n'en injecte que les DOUZE
-- dernières entrées. Une passe par heure qui écrirait « rien à prendre »
-- chasserait du bloc injecté ses consignes, les questions qui attendent sa
-- décision et les messages entre sessions — en une demi-journée. Les passes
-- vivent donc à part, et seule une passe qui a LIVRÉ quelque chose écrit dans
-- le journal.

create table if not exists public.passes_autonomes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Le nom de branche de la session, comme pour `dev_items.claimed_by` :
  -- c'est ce que Raphaël voit dans le cockpit.
  branche text not null,
  -- Ce que la passe a décidé en ouvrant les yeux. Une passe qui se retire est
  -- enregistrée elle aussi : sans ça, « il ne s'est rien passé cette nuit » ne
  -- se distingue pas de « la Routine ne tourne plus depuis trois jours ».
  verdict text not null check (verdict in ('travaille', 'eteint', 'occupe', 'rien_a_prendre')),
  raison text not null,
  item_id uuid references public.dev_items (id) on delete set null,
  resume text,
  commit_hash text,
  demarre_at timestamptz not null default now(),
  fini_at timestamptz
);

create index if not exists passes_autonomes_recent
  on public.passes_autonomes (user_id, demarre_at desc);

alter table public.passes_autonomes enable row level security;

drop policy if exists "passes: les siennes" on public.passes_autonomes;
create policy "passes: les siennes" on public.passes_autonomes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- L'utilisateur du projet. Les scripts des sessions tournent avec la clé de
-- service, donc sans `auth.uid()` : on retombe sur le propriétaire des
-- chantiers, exactement comme le fait déjà le `insert … select user_id from
-- dev_items limit 1` du CLAUDE.md.
create or replace function public.proprietaire_du_cockpit()
returns uuid language sql stable security definer set search_path = public as $$
  select coalesce(auth.uid(), (select user_id from public.dev_items order by created_at limit 1));
$$;

-- Ouvre une passe. Renvoie son identifiant, à repasser à `terminer_passe_autonome`.
create or replace function public.demarrer_passe_autonome(
  p_branche text,
  p_verdict text,
  p_raison text,
  p_item uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  insert into public.passes_autonomes (user_id, branche, verdict, raison, item_id,
                                       fini_at)
  values (public.proprietaire_du_cockpit(), p_branche, p_verdict, p_raison, p_item,
          -- Une passe qui se retire est finie à la seconde où elle s'ouvre :
          -- elle n'a rien commencé. Seule une passe qui travaille reste
          -- ouverte, et c'est elle qui dit aux suivantes que la place est prise.
          case when p_verdict = 'travaille' then null else now() end)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.terminer_passe_autonome(
  p_id uuid,
  p_resume text,
  p_commit text default null
) returns boolean language plpgsql security definer set search_path = public as $$
declare v_touche int;
begin
  update public.passes_autonomes
     set fini_at = now(), resume = p_resume, commit_hash = p_commit
   where id = p_id and fini_at is null;
  get diagnostics v_touche = row_count;
  return v_touche > 0;
end;
$$;

-- Ce que la prochaine passe a besoin de savoir pour décider, en UN appel : le
-- réglage, les réservations vivantes, les passes restées ouvertes, et les
-- chantiers ouverts avec leurs notes. La DÉCISION, elle, n'est pas ici : elle
-- est dans `src/lib/passeAutonome.ts`, qui lit les marqueurs avec exactement le
-- même code que le cockpit (`marqueurDe`). Deux lectures du marqueur `[LIBRE]`,
-- l'une en SQL et l'autre en TypeScript, finiraient par diverger — et le jour
-- où elles divergent, une session autonome prend un chantier `[À CADRER]`.
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
