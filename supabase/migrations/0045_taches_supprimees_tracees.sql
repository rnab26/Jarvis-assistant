-- Une suppression de tasks ne laissait AUCUNE trace — même trou que
-- dev_items avant la migration 0038, pour des données encore plus
-- personnelles (ses tâches, pas des notes de chantier).
--
-- POURQUOI (trouvé le 15 sept. 2026, capture à l'appui). En mode Live,
-- deux appels rapprochés de add_task ont créé deux tâches au titre
-- IDENTIQUE ("Rappel Jonathan Ducamp"), l'une sans date, l'autre avec une
-- échéance à 15h. Une commande de correction (update_task) a ensuite ciblé
-- un task_id qui ne correspondait à AUCUNE des deux dans l'état local —
-- silencieusement sans effet, la confirmation vocale l'a même trahi
-- ("la tâche" mise à jour, plutôt que le vrai titre : voir
-- src/lib/voiceActions.ts, corrigé dans le même travail pour REFUSER
-- plutôt que d'agir dans le vide). Une commande delete_task a ensuite
-- supprimé LA MAUVAISE des deux tâches — celle qui portait la bonne
-- échéance — sans qu'aucune trace ne permette de la retrouver.
--
-- LA SUPPRESSION RESTE POSSIBLE, exprès : c'est une vraie fonctionnalité
-- (corbeille d'une tâche dans l'app, confirmée par ConfirmerAction ; et la
-- voix, qui doit rester libre d'agir sans confirmation — décision de
-- Raphaël sur le contrôle du téléphone). La bonne réponse est de TRACER,
-- pas d'interdire, exactement le choix déjà fait pour dev_items.
--
-- TABLE SÉPARÉE, PAS UN HISTORIQUE DE tasks : une ligne de trace insérée
-- avant le DELETE serait sinon emportée par une éventuelle cascade future.
-- `taches_supprimees` ne porte aucun lien de cascade vers `tasks`.
create table if not exists public.taches_supprimees (
  id uuid primary key default gen_random_uuid(),
  -- L'id de la tâche disparue. Pas de foreign key : la ligne doit survivre
  -- même si l'id n'existe plus nulle part ailleurs.
  task_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Le nom de la catégorie, en plus de son id : si la catégorie est
  -- renommée ou supprimée entre-temps, la trace reste lisible et la
  -- restauration peut retomber sur le nom plutôt que sur un id mort.
  category_id uuid,
  category_name text,
  title text not null,
  notes text,
  due_date date,
  due_time time,
  status text not null,
  created_at timestamptz,
  supprime_par text,
  supprime_at timestamptz not null default now()
);

create index if not exists taches_supprimees_task on public.taches_supprimees (task_id);
create index if not exists taches_supprimees_user on public.taches_supprimees (user_id, supprime_at desc);

alter table public.taches_supprimees enable row level security;

-- Lecture seule pour l'utilisateur, même raison que dev_items_supprimes :
-- c'est le trigger qui écrit, en security definer — une ligne qu'on
-- pourrait fabriquer à la main ne prouverait rien.
drop policy if exists "taches_supprimees: le sien" on public.taches_supprimees;
create policy "taches_supprimees: le sien" on public.taches_supprimees
  for select using (auth.uid() = user_id);

create or replace function public.tracer_suppression_tache()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_nom_categorie text;
begin
  select name into v_nom_categorie from public.categories where id = old.category_id;
  insert into public.taches_supprimees
    (task_id, user_id, category_id, category_name, title, notes, due_date, due_time, status, created_at)
  values
    (old.id, old.user_id, old.category_id, v_nom_categorie, old.title, old.notes,
     old.due_date, old.due_time, old.status, old.created_at);
  return old;
end;
$$;

drop trigger if exists tracer_suppression_tache on public.tasks;
create trigger tracer_suppression_tache
  before delete on public.tasks
  for each row execute function public.tracer_suppression_tache();

-- Rendre une tâche supprimée par erreur. Passe par une fonction plutôt
-- qu'une écriture directe côté app, même logique que
-- restaurer_chantier_supprime (migration 0038) : la restauration reste
-- auditable, et reprend exactement ce qui a été perdu.
--
-- Si la catégorie d'origine n'existe plus, on retombe sur "Sans
-- catégorie" (category_id null) plutôt que de faire échouer toute la
-- restauration sur une contrainte de clé étrangère.
create or replace function public.restaurer_tache_supprimee(p_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_ligne public.taches_supprimees%rowtype;
  v_categorie_existe boolean;
  v_nouveau uuid;
begin
  select * into v_ligne from public.taches_supprimees
   where id = p_id and user_id = auth.uid();
  if not found then
    raise exception 'suppression introuvable';
  end if;

  v_categorie_existe := v_ligne.category_id is not null
    and exists (select 1 from public.categories where id = v_ligne.category_id);

  insert into public.tasks (user_id, category_id, title, notes, due_date, due_time, status)
  values (v_ligne.user_id, case when v_categorie_existe then v_ligne.category_id else null end,
          v_ligne.title, v_ligne.notes, v_ligne.due_date, v_ligne.due_time, v_ligne.status)
  returning id into v_nouveau;

  delete from public.taches_supprimees where id = p_id;

  return v_nouveau;
end;
$$;
