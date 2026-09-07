-- Une suppression de dev_items ne laissait AUCUNE trace.
--
-- POURQUOI (chantier 019144d8, trouvé le 7 sept. 2026). Un chantier a été
-- supprimé — un vrai DELETE, pas un archivage — entre le 6 sept. ~17h et le
-- 7 sept. 04h12 UTC. Zéro trace dans dev_log ni dans dev_items_historique.
-- Son contenu n'a pu être retrouvé que parce qu'une copie existait ailleurs
-- dans une conversation ; sans elle, il aurait été perdu pour de bon.
--
-- LA CAUSE, VÉRIFIÉE ET PAS SUPPOSÉE : `select * from information_schema.
-- triggers where event_object_table = 'dev_items'` ne montre AUCUN trigger
-- sur DELETE — `tracer_changement_dev_item()` (migration 0027) ne se
-- déclenche que sur UPDATE.
--
-- LA SUPPRESSION RESTE POSSIBLE, exprès : c'est une vraie fonctionnalité du
-- cockpit (bouton « Choisir » > Supprimer, confirmée à l'écran par
-- ConfirmerAction, `dev_items_delete_own` posée dès la migration 0003). La
-- bloquer casserait ce bouton — un comportement visible que Raphaël n'a
-- jamais remis en cause. La bonne réponse est donc de tracer, pas d'interdire.
--
-- POURQUOI UNE TABLE SÉPARÉE, ET PAS dev_items_historique : `item_id` y
-- référence `dev_items(id) on delete cascade` (migration 0027). Une ligne de
-- trace insérée AVANT le DELETE y serait donc emportée par ce même DELETE —
-- exactement le trou qu'on essaie de boucher. `dev_items_supprimes` ne porte
-- aucun lien de cascade vers dev_items : la ligne survit à la suppression
-- qu'elle décrit.

create table if not exists public.dev_items_supprimes (
  id uuid primary key default gen_random_uuid(),
  -- L'id du chantier disparu. Pas de foreign key : la ligne doit survivre
  -- même si l'id n'existe plus nulle part ailleurs.
  item_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  notes text,
  status text,
  priority text,
  theme text,
  created_at timestamptz,
  archived_at timestamptz,
  -- La réservation en cours au moment du DELETE, quand on peut la connaître —
  -- même logique que `par` dans dev_items_historique.
  supprime_par text,
  supprime_at timestamptz not null default now()
);

create index if not exists dev_items_supprimes_item on public.dev_items_supprimes (item_id);

alter table public.dev_items_supprimes enable row level security;

-- Lecture seule pour l'utilisateur : personne n'écrit à la main ici, c'est le
-- trigger qui écrit en security definer. Une ligne qu'on pourrait fabriquer
-- ne prouverait rien — même raison que dev_items_historique.
drop policy if exists "supprimes: le sien" on public.dev_items_supprimes;
create policy "supprimes: le sien" on public.dev_items_supprimes
  for select using (auth.uid() = user_id);

create or replace function public.tracer_suppression_dev_item()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.dev_items_supprimes
    (item_id, user_id, title, notes, status, priority, theme, created_at, archived_at, supprime_par)
  values
    (old.id, old.user_id, old.title, old.notes, old.status, old.priority, old.theme,
     old.created_at, old.archived_at, old.claimed_by);
  return old;
end;
$$;

drop trigger if exists tracer_suppression_dev_item on public.dev_items;
create trigger tracer_suppression_dev_item
  before delete on public.dev_items
  for each row execute function public.tracer_suppression_dev_item();

-- Rendre un chantier supprimé par erreur. Passe par une fonction plutôt que
-- par une écriture directe côté app, même logique que
-- `restaurer_note_chantier` (migration 0027) : la restauration doit elle-même
-- rester auditable, et le nouveau chantier doit reprendre exactement ce qui a
-- été perdu, pas une version reconstituée à la main.
create or replace function public.restaurer_chantier_supprime(p_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_ligne public.dev_items_supprimes%rowtype;
  v_nouveau uuid;
begin
  select * into v_ligne from public.dev_items_supprimes
   where id = p_id and user_id = auth.uid();
  if not found then
    raise exception 'suppression introuvable';
  end if;

  insert into public.dev_items (user_id, title, notes, status, priority, theme, archived_at)
  values (v_ligne.user_id, v_ligne.title, v_ligne.notes, v_ligne.status, v_ligne.priority,
          v_ligne.theme, v_ligne.archived_at)
  returning id into v_nouveau;

  delete from public.dev_items_supprimes where id = p_id;

  return v_nouveau;
end;
$$;
