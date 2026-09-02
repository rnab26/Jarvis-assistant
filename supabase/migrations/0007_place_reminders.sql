-- Rappels liés à un lieu, déclenchés par la conversation (pas par le GPS,
-- pour ne pas consommer de batterie) : si l'utilisateur mentionne le lieu
-- en parlant à Jarvis, Jarvis glisse le rappel dans sa réponse.

create table place_reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  place text not null,
  reminder text not null,
  created_at timestamptz not null default now()
);

create index place_reminders_user_id_idx on place_reminders (user_id);

alter table place_reminders enable row level security;

create policy "place_reminders_select_own" on place_reminders
  for select using ((select auth.uid()) = user_id);
create policy "place_reminders_insert_own" on place_reminders
  for insert with check ((select auth.uid()) = user_id);
create policy "place_reminders_update_own" on place_reminders
  for update using ((select auth.uid()) = user_id);
create policy "place_reminders_delete_own" on place_reminders
  for delete using ((select auth.uid()) = user_id);
