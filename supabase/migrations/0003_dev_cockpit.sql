-- Cockpit interne : suivi des chantiers de développement de Jarvis lui-même,
-- séparé des tâches perso/clients (table tasks).

create table dev_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  notes text,
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'done')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index dev_items_user_id_idx on dev_items (user_id);

alter table dev_items enable row level security;

create policy "dev_items_select_own" on dev_items
  for select using ((select auth.uid()) = user_id);
create policy "dev_items_insert_own" on dev_items
  for insert with check ((select auth.uid()) = user_id);
create policy "dev_items_update_own" on dev_items
  for update using ((select auth.uid()) = user_id);
create policy "dev_items_delete_own" on dev_items
  for delete using ((select auth.uid()) = user_id);
