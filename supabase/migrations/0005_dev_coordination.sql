-- Coordination entre les sessions Claude Code qui travaillent sur ce repo en
-- parallèle. Deux besoins distincts : ne pas prendre le même chantier à deux,
-- et pouvoir se poser des questions en différé (une session peut être arrêtée
-- quand une autre lui écrit).

-- 1. Réservation d'un chantier. L'expiration évite qu'une session interrompue
--    bloque un chantier indéfiniment : passé le délai, il redevient libre.
alter table dev_items
  add column claimed_by text,
  add column claimed_at timestamptz,
  add column claim_expires_at timestamptz;

create index dev_items_claim_idx on dev_items (claim_expires_at)
  where claim_expires_at is not null;

-- 2. Journal de bord : les messages échangés entre sessions, rattachés à un
--    chantier ou généraux (item_id null).
create table dev_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  item_id uuid references dev_items (id) on delete cascade,
  author text not null,
  kind text not null default 'info'
    check (kind in ('question', 'reponse', 'info', 'blocage')),
  body text not null,
  answered_at timestamptz,
  created_at timestamptz not null default now()
);

create index dev_log_user_created_idx on dev_log (user_id, created_at desc);
create index dev_log_item_idx on dev_log (item_id);

alter table dev_log enable row level security;

create policy "dev_log_select_own" on dev_log
  for select using ((select auth.uid()) = user_id);
create policy "dev_log_insert_own" on dev_log
  for insert with check ((select auth.uid()) = user_id);
create policy "dev_log_update_own" on dev_log
  for update using ((select auth.uid()) = user_id);
create policy "dev_log_delete_own" on dev_log
  for delete using ((select auth.uid()) = user_id);

-- 3. Prise de chantier atomique : deux sessions qui appellent ceci en même
--    temps, une seule obtient true. Un simple "lire puis écrire" laisserait
--    les deux croire qu'elles ont gagné.
create or replace function claim_dev_item(
  p_item uuid,
  p_session text,
  p_minutes int default 120
)
returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  pris boolean;
begin
  update dev_items
  set claimed_by = p_session,
      claimed_at = now(),
      claim_expires_at = now() + make_interval(mins => p_minutes),
      status = case when status = 'todo' then 'in_progress' else status end,
      updated_at = now()
  where id = p_item
    and (
      claimed_by is null
      or claimed_by = p_session
      or claim_expires_at < now()
    )
  returning true into pris;

  return coalesce(pris, false);
end;
$$;

-- 4. Libération explicite, quand une session s'arrête ou termine.
create or replace function release_dev_item(p_item uuid, p_session text)
returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  libere boolean;
begin
  update dev_items
  set claimed_by = null,
      claimed_at = null,
      claim_expires_at = null,
      updated_at = now()
  where id = p_item
    and claimed_by = p_session
  returning true into libere;

  return coalesce(libere, false);
end;
$$;
