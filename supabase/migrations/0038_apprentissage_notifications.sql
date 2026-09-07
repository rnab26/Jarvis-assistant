-- Ce que Jarvis apprend de ses propres notifications (chantier 05241cc7).
--
-- Sa réponse, 6 sept. 2026 : « Oui, qu'il apprenne. » Question posée avec ce
-- qu'elle implique — Jarvis enregistre ce qu'il ouvre, ignore ou balaie, et
-- ajuste ce qui mérite de le déranger.
--
-- CE QUE CETTE TABLE NE FAIT PAS, et c'est voulu :
-- - elle ne stocke aucun contenu de notification (ni titre ni corps), rien
--   qu'un canal (le même que src/lib/notifications/plan.ts) et deux horodatages ;
-- - elle ne sert jamais à COUPER un canal que Raphaël a activé — voir
--   src/lib/notifications/apprentissage.ts, qui n'ajuste que l'insistance
--   vocale d'un sous-ensemble de canaux non critiques ;
-- - rien n'en sort vers l'extérieur : RLS par utilisateur, comme push_tokens
--   (migration 0029).
create table if not exists public.notifications_journal (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  canal text not null,
  notif_id integer,
  envoyee_at timestamptz not null default now(),
  ouverte_at timestamptz
);

create index if not exists notifications_journal_user_canal_idx
  on public.notifications_journal (user_id, canal, envoyee_at desc);

alter table public.notifications_journal enable row level security;

drop policy if exists "notifications_journal: le sien" on public.notifications_journal;
create policy "notifications_journal: le sien" on public.notifications_journal
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
