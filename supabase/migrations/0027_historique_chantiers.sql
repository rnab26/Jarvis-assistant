-- Un chantier garde ce qu'on y a écrit.
--
-- POURQUOI. Le CLAUDE.md du projet porte cet avertissement, écrit après coup :
-- « Le 5 sept. puis le 6, deux notes ont été écrasées de cette façon — l'une
-- contenait un retour de Raphaël qui n'était écrit nulle part ailleurs. » La
-- parade était une consigne, « relis la note dans un appel SÉPARÉ avant de la
-- réécrire ». Une consigne qu'aucun mécanisme ne soutient finit par être
-- oubliée : c'est déjà arrivé deux fois en deux jours.
--
-- UN TRIGGER ET PAS UNE ÉCRITURE CÔTÉ APP, parce que les notes sont réécrites
-- depuis partout : l'app, la commande vocale, `scripts/sql.sh`, les sessions
-- Claude Code. Un seul de ces chemins oublié, et la trace manque précisément
-- le jour où on en a besoin.

create table if not exists public.dev_items_historique (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.dev_items (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Le champ touché : title, notes, status, priority, theme, archived_at.
  champ text not null,
  avant text,
  apres text,
  -- Qui a écrit, quand on peut le savoir : la réservation en cours au moment
  -- du changement. Une session qui travaille sans réserver reste anonyme, et
  -- c'est une raison de plus de réserver.
  par text,
  change_at timestamptz not null default now()
);

create index if not exists dev_items_historique_chantier
  on public.dev_items_historique (item_id, change_at desc);

alter table public.dev_items_historique enable row level security;

-- Lecture et suppression seulement : personne n'écrit ici à la main, c'est le
-- trigger qui écrit. Une ligne qu'on pourrait fabriquer ne prouverait rien.
drop policy if exists "historique: le sien" on public.dev_items_historique;
create policy "historique: le sien" on public.dev_items_historique
  for select using (auth.uid() = user_id);

create or replace function public.tracer_changement_dev_item()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_par text;
begin
  -- LES RÉSERVATIONS NE SONT PAS TRACÉES, ET C'EST VOULU. `claim_dev_item` et
  -- `release_dev_item` tournent à chaque passe autonome, toutes les heures :
  -- les enregistrer noierait en un jour les changements qui comptent.
  v_par := coalesce(new.claimed_by, old.claimed_by);

  if new.title is distinct from old.title then
    insert into dev_items_historique (item_id, user_id, champ, avant, apres, par)
    values (new.id, new.user_id, 'title', old.title, new.title, v_par);
  end if;

  if new.notes is distinct from old.notes then
    insert into dev_items_historique (item_id, user_id, champ, avant, apres, par)
    values (new.id, new.user_id, 'notes', old.notes, new.notes, v_par);
  end if;

  if new.status is distinct from old.status then
    insert into dev_items_historique (item_id, user_id, champ, avant, apres, par)
    values (new.id, new.user_id, 'status', old.status, new.status, v_par);
  end if;

  if new.priority is distinct from old.priority then
    insert into dev_items_historique (item_id, user_id, champ, avant, apres, par)
    values (new.id, new.user_id, 'priority', old.priority, new.priority, v_par);
  end if;

  if new.theme is distinct from old.theme then
    insert into dev_items_historique (item_id, user_id, champ, avant, apres, par)
    values (new.id, new.user_id, 'theme', old.theme, new.theme, v_par);
  end if;

  if new.archived_at is distinct from old.archived_at then
    insert into dev_items_historique (item_id, user_id, champ, avant, apres, par)
    values (new.id, new.user_id, 'archived_at',
            to_char(old.archived_at, 'YYYY-MM-DD"T"HH24:MI:SSOF'),
            to_char(new.archived_at, 'YYYY-MM-DD"T"HH24:MI:SSOF'), v_par);
  end if;

  return new;
end;
$$;

drop trigger if exists tracer_dev_item on public.dev_items;
create trigger tracer_dev_item
  after update on public.dev_items
  for each row execute function public.tracer_changement_dev_item();

-- Rendre une note d'avant. Passe par une fonction plutôt que par un `update`
-- côté app pour une raison précise : la restauration doit elle-même laisser
-- une trace, sinon on remplace une perte par une autre.
create or replace function public.restaurer_note_chantier(p_historique uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_ligne public.dev_items_historique%rowtype;
begin
  select * into v_ligne from public.dev_items_historique
   where id = p_historique and user_id = auth.uid();
  if not found then
    raise exception 'historique introuvable';
  end if;
  if v_ligne.champ <> 'notes' then
    raise exception 'seule une note se restaure';
  end if;

  update public.dev_items set notes = v_ligne.avant, updated_at = now()
   where id = v_ligne.item_id and user_id = auth.uid();

  return v_ligne.avant;
end;
$$;
