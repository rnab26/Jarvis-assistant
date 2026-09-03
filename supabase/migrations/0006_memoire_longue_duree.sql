-- Mémoire longue durée de Jarvis. Décisions de Raphaël (fiche du 2 sept.) :
-- mémorisation silencieuse avec une page de relecture, mot-à-mot gardé 7 jours,
-- aucun sujet exclu d'office mais possibilité de dire d'oublier à tout moment.

create extension if not exists vector with schema extensions;

-- Des FAITS courts, jamais le texte des conversations.
create table souvenirs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  contenu text not null,
  categorie text not null default 'fait'
    check (categorie in ('personne', 'dossier', 'engagement', 'preference', 'fait')),
  -- La phrase d'origine, pour que Raphaël puisse vérifier d'où sort un souvenir.
  source text,
  -- gte-small, le modèle embarqué dans les Edge Functions Supabase : gratuit,
  -- 384 dimensions, tourne sur place sans appel à un service payant.
  embedding extensions.vector(384),
  -- Un fait remplacé par un autre est marqué périmé, pas supprimé : Jarvis
  -- doit pouvoir dire « avant c'était 4 000, tu m'as dit 4 500 depuis ».
  perime_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index souvenirs_user_idx on souvenirs (user_id, created_at desc);
create index souvenirs_vivants_idx on souvenirs (user_id) where perime_at is null;

-- hnsw plutôt qu'ivfflat : pas de liste à recalculer quand le volume grossit,
-- et à cette échelle (quelques milliers de souvenirs) la mémoire est négligeable.
create index souvenirs_embedding_idx on souvenirs
  using hnsw (embedding extensions.vector_cosine_ops);

alter table souvenirs enable row level security;

create policy "souvenirs_select_own" on souvenirs
  for select using ((select auth.uid()) = user_id);
create policy "souvenirs_insert_own" on souvenirs
  for insert with check ((select auth.uid()) = user_id);
create policy "souvenirs_update_own" on souvenirs
  for update using ((select auth.uid()) = user_id);
create policy "souvenirs_delete_own" on souvenirs
  for delete using ((select auth.uid()) = user_id);

-- Le mot-à-mot des échanges, gardé 7 jours puis jeté. Sert uniquement à
-- vérifier ce que Jarvis a compris ; la valeur durable est dans souvenirs.
create table echanges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  transcript text not null,
  reponse text,
  created_at timestamptz not null default now()
);

create index echanges_user_idx on echanges (user_id, created_at desc);

alter table echanges enable row level security;

create policy "echanges_select_own" on echanges
  for select using ((select auth.uid()) = user_id);
create policy "echanges_insert_own" on echanges
  for insert with check ((select auth.uid()) = user_id);
create policy "echanges_delete_own" on echanges
  for delete using ((select auth.uid()) = user_id);

-- Recherche par le sens. Le seuil écarte les souvenirs sans rapport : sans lui
-- on remonterait toujours quelque chose, même hors sujet.
create or replace function chercher_souvenirs(
  p_embedding extensions.vector(384),
  p_limite int default 8,
  p_seuil float default 0.25
)
returns table (id uuid, contenu text, categorie text, proximite float)
language sql
stable
security invoker
set search_path = public, extensions, pg_temp
as $$
  select s.id,
         s.contenu,
         s.categorie,
         1 - (s.embedding operator(extensions.<=>) p_embedding) as proximite
  from souvenirs s
  where s.user_id = (select auth.uid())
    and s.perime_at is null
    and s.embedding is not null
    and 1 - (s.embedding operator(extensions.<=>) p_embedding) > p_seuil
  order by s.embedding operator(extensions.<=>) p_embedding
  limit least(p_limite, 20);
$$;

-- Purge du mot-à-mot au-delà de 7 jours. Appelée à chaque échange plutôt que
-- planifiée : pas de tâche à maintenir, et le volume reste minuscule.
create or replace function purger_echanges()
returns int
language sql
security invoker
set search_path = public, pg_temp
as $$
  with supprimes as (
    delete from echanges
    where user_id = (select auth.uid())
      and created_at < now() - interval '7 days'
    returning 1
  )
  select count(*)::int from supprimes;
$$;
