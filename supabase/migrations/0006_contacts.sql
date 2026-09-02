-- Contacts : qui est qui pour Raphaël, et ce qu'il attend pour chacun
-- (relation, contexte, instructions), pour que Jarvis puisse s'y référer
-- à la voix (ex: "envoie un message au client de Melissa").

create table contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index contacts_user_id_idx on contacts (user_id);

alter table contacts enable row level security;

create policy "contacts_select_own" on contacts
  for select using ((select auth.uid()) = user_id);
create policy "contacts_insert_own" on contacts
  for insert with check ((select auth.uid()) = user_id);
create policy "contacts_update_own" on contacts
  for update using ((select auth.uid()) = user_id);
create policy "contacts_delete_own" on contacts
  for delete using ((select auth.uid()) = user_id);
