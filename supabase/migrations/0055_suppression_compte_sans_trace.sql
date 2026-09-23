-- Supprimer un COMPTE qui a des tâches échouait — le défaut de la migration
-- 0044, réintroduit un jour plus tard par la 0045.
--
-- Trouvé le 23 sept. 2026 en nettoyant un utilisateur de test resté en base :
--   {"code":"23503","message":"insert or update on table \"taches_supprimees\"
--   violates foreign key constraint \"taches_supprimees_user_id_fkey\"",
--   "detail":"Key (user_id)=(…) is not present in table \"users\"."}
--
-- Exactement le message que la migration 0044 a lu et corrigé le 8 sept. pour
-- `dev_items_supprimes` : PostgreSQL supprime la ligne d'auth.users PUIS
-- applique les cascades ; celle qui atteint `tasks` déclenche le trigger
-- BEFORE DELETE de la 0045, qui insère une trace référençant un compte déjà
-- parti — et tout le DELETE du compte est annulé. La 0045 a recopié le
-- mécanisme de la 0038 sans le garde-fou ajouté entre-temps par la 0044.
--
-- Même conséquence silencieuse qu'alors : cinq comptes `…@jarvis-test.local`
-- (15, 17 et 23 sept.) restés en base, leurs « essai temps réel » injectés au
-- démarrage de chaque session — les scripts de vérification ne lisaient pas
-- le retour de la suppression. `verifier-donnees.mjs` le lit désormais : c'est
-- lui qui rougira si une troisième trace refait l'erreur.
--
-- Même règle que la 0044, pour les mêmes raisons (sa politique RLS est
-- `auth.uid() = user_id` : une trace dont le propriétaire a disparu ne peut
-- plus être ni lue ni restaurée). Une suppression ordinaire d'une tâche est
-- tracée exactement comme avant.

create or replace function public.tracer_suppression_tache()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_nom_categorie text;
begin
  -- Le propriétaire s'en va avec la tâche : vrai UNIQUEMENT quand ce DELETE
  -- est une cascade venue d'auth.users.
  if not exists (select 1 from auth.users where id = old.user_id) then
    return old;
  end if;
  select name into v_nom_categorie from public.categories where id = old.category_id;
  insert into public.taches_supprimees
    (task_id, user_id, category_id, category_name, title, notes, due_date, due_time, status, created_at)
  values
    (old.id, old.user_id, old.category_id, v_nom_categorie, old.title, old.notes,
     old.due_date, old.due_time, old.status, old.created_at);
  return old;
end;
$$;
