-- Un onglet dédié aux notes personnelles, distinct des tâches (échéance),
-- des documents (fichiers) et de la mémoire (ce que Jarvis retient tout
-- seul) — chantier 5ad49cc0. Du texte libre qu'il écrit pour lui, sans
-- échéance et sans que Jarvis en fasse quoi que ce soit tout seul.
--
-- Même cloisonnement RLS que tasks/documents, et le même mécanisme temps
-- réel que tasks/categories/dev_items (migration 0011) : REPLICA IDENTITY
-- FULL, sans quoi un DELETE ne transporte que la clé primaire et Realtime ne
-- peut pas évaluer la policy RLS sur user_id.

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  content text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists notes_user_id_idx on public.notes (user_id);

alter table public.notes enable row level security;

create policy "notes_select_own" on public.notes
  for select using (auth.uid() = user_id);
create policy "notes_insert_own" on public.notes
  for insert with check (auth.uid() = user_id);
create policy "notes_update_own" on public.notes
  for update using (auth.uid() = user_id);
create policy "notes_delete_own" on public.notes
  for delete using (auth.uid() = user_id);

alter table public.notes replica identity full;
alter publication supabase_realtime add table public.notes;
