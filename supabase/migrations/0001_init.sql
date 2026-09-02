-- Jarvis Phase 1 : catégories et tâches, avec RLS par utilisateur.

create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  category_id uuid references categories (id) on delete set null,
  title text not null,
  notes text,
  due_date date,
  status text not null default 'todo' check (status in ('todo', 'done')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tasks_user_id_idx on tasks (user_id);
create index if not exists tasks_category_id_idx on tasks (category_id);
create index if not exists categories_user_id_idx on categories (user_id);

alter table categories enable row level security;
alter table tasks enable row level security;

create policy "categories_select_own" on categories
  for select using (auth.uid() = user_id);
create policy "categories_insert_own" on categories
  for insert with check (auth.uid() = user_id);
create policy "categories_update_own" on categories
  for update using (auth.uid() = user_id);
create policy "categories_delete_own" on categories
  for delete using (auth.uid() = user_id);

create policy "tasks_select_own" on tasks
  for select using (auth.uid() = user_id);
create policy "tasks_insert_own" on tasks
  for insert with check (auth.uid() = user_id);
create policy "tasks_update_own" on tasks
  for update using (auth.uid() = user_id);
create policy "tasks_delete_own" on tasks
  for delete using (auth.uid() = user_id);
