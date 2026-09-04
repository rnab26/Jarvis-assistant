-- Les sections de chantiers : le cockpit rangé par sujet, et ce rangement
-- devient une chose qu'on gère, pas un effet de bord.
--
-- Pourquoi. Jusqu'ici une « section » n'existait que par accident : c'était la
-- valeur du champ texte `dev_items.theme`, et donc une section n'existait que
-- tant qu'un chantier la portait. Impossible d'en créer une à l'avance
-- (« Entraînement », « Fonctionnalités » — les mots de Raphaël), de la
-- renommer sans réécrire chaque chantier à la main, de la supprimer, d'en
-- fusionner deux, ni de choisir l'ordre dans lequel elles s'affichent.
--
-- Ce qui NE change pas : `dev_items.theme` reste du texte libre et reste la
-- source de vérité du rattachement. Tout le reste du projet le lit comme ça —
-- le hook de démarrage, la commande vocale, scripts/sql.sh, les autres
-- sessions Claude Code. Une table de sections qui deviendrait une clé
-- étrangère casserait tout ça pour rien. `dev_sections` ne porte donc que ce
-- que le texte libre ne sait pas porter : l'existence d'une section vide, son
-- ordre, sa description. Les deux sont tenus alignés par les fonctions
-- ci-dessous, jamais par deux écritures séparées côté app.

-- La clé de comparaison de deux noms de section. Reprend mot pour mot
-- src/lib/themeChantier.ts (cleTheme) : accents, apostrophes, tirets,
-- soulignés, majuscules et espaces multiples ne distinguent pas deux sujets,
-- ils ne font que fabriquer des jumeaux (« L'app elle-même » / « L app
-- elle-meme », vraiment arrivé le 3 sept. 2026).
-- (La classe [̀-ͯ] ci-dessous contient les marques combinantes
-- U+0300 a U+036F en clair : ce sont les accents detaches par normalize(nfd).
-- Ne pas les "nettoyer" en croyant a des caracteres parasites.)
create or replace function cle_section(p_nom text)
returns text
language sql
immutable
strict
set search_path = public, pg_temp
as $$
  select trim(regexp_replace(
    regexp_replace(
      lower(regexp_replace(normalize(p_nom, nfd), '[̀-ͯ]', '', 'g')),
      '[''’\-_]', ' ', 'g'
    ),
    '\s+', ' ', 'g'
  ));
$$;

create table if not exists dev_sections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  nom text not null,
  -- À quoi sert la section : ce qu'on y range, ce qu'on n'y range pas.
  description text,
  -- L'ordre d'affichage choisi par Raphaël. Un ordre calculé (par urgence)
  -- change tout seul d'un jour à l'autre : on ne retrouve plus une section
  -- là où on l'avait laissée.
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Deux sections ne peuvent pas porter le même nom à une apostrophe près.
create unique index if not exists dev_sections_nom_unique
  on dev_sections (user_id, cle_section(nom));
create index if not exists dev_sections_ordre on dev_sections (user_id, position);

alter table dev_sections enable row level security;

create policy "dev_sections_select_own" on dev_sections
  for select using ((select auth.uid()) = user_id);
create policy "dev_sections_insert_own" on dev_sections
  for insert with check ((select auth.uid()) = user_id);
create policy "dev_sections_update_own" on dev_sections
  for update using ((select auth.uid()) = user_id);
create policy "dev_sections_delete_own" on dev_sections
  for delete using ((select auth.uid()) = user_id);

-- Les sections qui existent déjà de fait : un thème porté par au moins un
-- chantier. Sans cette reprise, la première ouverture du cockpit après la
-- migration afficherait « aucune section » devant quatre-vingts chantiers
-- rangés.
insert into dev_sections (user_id, nom, position)
select user_id, theme, row_number() over (partition by user_id order by theme)
from (
  select distinct user_id, trim(theme) as theme
  from dev_items
  where theme is not null and trim(theme) <> ''
) as existants
on conflict do nothing;

-- Renommer : le nom de la section ET le thème de tous ses chantiers, d'un
-- seul geste. Deux écritures séparées côté app laisseraient, si la seconde
-- échoue, une section vide à côté de chantiers orphelins.
create or replace function renommer_section(p_id uuid, p_nom text)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  ancien text;
  proprio uuid;
  touches integer;
begin
  select nom, user_id into ancien, proprio from dev_sections where id = p_id;
  if ancien is null then
    raise exception 'Section introuvable';
  end if;

  update dev_sections set nom = trim(p_nom), updated_at = now() where id = p_id;

  update dev_items
  set theme = trim(p_nom), updated_at = now()
  where user_id = proprio and cle_section(coalesce(theme, '')) = cle_section(ancien);
  get diagnostics touches = row_count;

  return touches;
end;
$$;

-- Fusionner : tous les chantiers de la source passent dans la cible, la
-- source disparaît. C'est ce qu'on veut quand deux sections disent la même
-- chose ; le faire à la main, chantier par chantier, ne se fait jamais.
create or replace function fusionner_sections(p_source uuid, p_cible uuid)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  nom_source text;
  nom_cible text;
  proprio uuid;
  touches integer;
begin
  select nom, user_id into nom_source, proprio from dev_sections where id = p_source;
  select nom into nom_cible from dev_sections where id = p_cible;
  if nom_source is null or nom_cible is null then
    raise exception 'Section introuvable';
  end if;

  update dev_items
  set theme = nom_cible, updated_at = now()
  where user_id = proprio and cle_section(coalesce(theme, '')) = cle_section(nom_source);
  get diagnostics touches = row_count;

  delete from dev_sections where id = p_source;
  return touches;
end;
$$;

-- Supprimer : soit les chantiers partent dans une autre section, soit ils
-- redeviennent « à classer ». Jamais supprimés avec elle — une section est un
-- rangement, pas un contenant.
create or replace function supprimer_section(p_id uuid, p_vers uuid default null)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  nom_source text;
  nom_cible text;
  proprio uuid;
  touches integer;
begin
  select nom, user_id into nom_source, proprio from dev_sections where id = p_id;
  if nom_source is null then
    raise exception 'Section introuvable';
  end if;

  if p_vers is not null then
    select nom into nom_cible from dev_sections where id = p_vers;
    if nom_cible is null then
      raise exception 'Section de destination introuvable';
    end if;
  end if;

  update dev_items
  set theme = nom_cible, updated_at = now()
  where user_id = proprio and cle_section(coalesce(theme, '')) = cle_section(nom_source);
  get diagnostics touches = row_count;

  delete from dev_sections where id = p_id;
  return touches;
end;
$$;

-- Réordonner d'un seul appel : la position de chaque section est son rang
-- dans le tableau reçu. Une écriture par section laisserait, en cas de
-- coupure au milieu, un ordre à moitié appliqué.
create or replace function reordonner_sections(p_ids uuid[])
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  touches integer;
begin
  update dev_sections s
  set position = r.rang, updated_at = now()
  from (select id, ordinality::int as rang from unnest(p_ids) with ordinality as t(id, ordinality)) r
  where s.id = r.id;
  get diagnostics touches = row_count;
  return touches;
end;
$$;
