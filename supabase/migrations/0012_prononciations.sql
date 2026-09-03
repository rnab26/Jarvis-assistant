-- Corrections de transcription apprises à l'oral.
--
-- La dictée vocale se trompe systématiquement sur certains mots — surtout les
-- noms propres qu'aucun dictionnaire ne connaît. Exemple donné par Raphaël :
-- "Avihail" ressort avec un "re" qu'il n'a jamais prononcé. Plutôt que de
-- corriger à la main chaque fois, Jarvis retient la correspondance quand
-- Raphaël la lui dit, et l'applique avant d'interpréter la commande.
--
-- entendu   : ce que la reconnaissance vocale produit (le mot faux).
-- veut_dire : ce que Raphaël a réellement dit.
-- Une ligne par variante entendue : le même nom peut sortir de plusieurs
-- façons selon la phrase.

create table prononciations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  entendu text not null,
  veut_dire text not null,
  created_at timestamptz not null default now()
);

create index prononciations_user_id_idx on prononciations (user_id);

alter table prononciations enable row level security;

create policy "prononciations_select_own" on prononciations
  for select using ((select auth.uid()) = user_id);
create policy "prononciations_insert_own" on prononciations
  for insert with check ((select auth.uid()) = user_id);
create policy "prononciations_update_own" on prononciations
  for update using ((select auth.uid()) = user_id);
create policy "prononciations_delete_own" on prononciations
  for delete using ((select auth.uid()) = user_id);
