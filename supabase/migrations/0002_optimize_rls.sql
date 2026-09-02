-- Optimisation recommandée par Supabase : (select auth.uid()) au lieu de
-- auth.uid() dans les policies, pour éviter une ré-évaluation par ligne.
-- Aucun changement de comportement, uniquement de performance à l'échelle.

drop policy "categories_select_own" on categories;
drop policy "categories_insert_own" on categories;
drop policy "categories_update_own" on categories;
drop policy "categories_delete_own" on categories;

create policy "categories_select_own" on categories
  for select using ((select auth.uid()) = user_id);
create policy "categories_insert_own" on categories
  for insert with check ((select auth.uid()) = user_id);
create policy "categories_update_own" on categories
  for update using ((select auth.uid()) = user_id);
create policy "categories_delete_own" on categories
  for delete using ((select auth.uid()) = user_id);

drop policy "tasks_select_own" on tasks;
drop policy "tasks_insert_own" on tasks;
drop policy "tasks_update_own" on tasks;
drop policy "tasks_delete_own" on tasks;

create policy "tasks_select_own" on tasks
  for select using ((select auth.uid()) = user_id);
create policy "tasks_insert_own" on tasks
  for insert with check ((select auth.uid()) = user_id);
create policy "tasks_update_own" on tasks
  for update using ((select auth.uid()) = user_id);
create policy "tasks_delete_own" on tasks
  for delete using ((select auth.uid()) = user_id);
