-- Le registre des erreurs de Jarvis : la section du cockpit qui n'est pas
-- faite de chantiers.
--
-- Demande de Raphaël (chantier f2f6667f) : « ajouter une section qui ne fait
-- pas partie des chantiers qui irait récupérer toutes les erreurs système ou
-- d'utilisation ou de compréhension, d'action — bref toutes les erreurs que
-- Jarvis fait — en les qualifiant selon des thèmes d'erreurs afin de ne
-- perdre aucune erreur et de les corriger, avec la possibilité de créer un
-- chantier en y ajoutant des notes de correction qui seront prises en compte
-- afin d'entraîner plus rapidement Jarvis. »
--
-- Ce qui manquait, concrètement : une écriture qui échoue affiche un toast
-- rouge qui disparaît en cinq secondes, un échec Live part dans
-- journal_ecoute (purgé à 7 jours, illisible sans SQL), et une erreur de
-- COMPRÉHENSION — Jarvis qui répond à côté — ne laisse aucune trace nulle
-- part. Raphaël la raconte de mémoire trois jours plus tard, ou elle est
-- perdue.
--
-- Deux principes portés par cette table :
--   1. Regroupement, pas empilement. La même erreur qui revient trente fois
--      est UNE ligne avec un compteur — sinon la liste devient illisible le
--      jour où elle sert vraiment. D'où `empreinte` et `occurrences`.
--   2. Une erreur corrigée qui revient doit se voir. Le compteur seul ne
--      suffirait pas : la ligne rouvre (statut « nouveau ») et garde la date
--      de sa réapparition.

create table if not exists jarvis_erreurs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,

  -- Le « thème d'erreur » demandé par Raphaël. Liste fermée, contrairement
  -- aux thèmes de chantiers : une erreur est classée par ce qui a lâché, et
  -- ces familles-là ne se découvrent pas en travaillant.
  --   comprehension : il a compris autre chose que ce qui était demandé
  --   action        : il a compris, mais a fait autre chose (ou rien)
  --   ecoute        : le micro n'a pas entendu, s'est coupé, a inventé
  --   serveur       : le modèle ou la Edge Function a refusé de répondre
  --   systeme       : une écriture a échoué (réseau, droits, base)
  --   utilisation   : l'app a mal guidé, un écran a manqué
  --   autre         : ce qui ne rentre nulle part, plutôt que d'être perdu
  categorie text not null default 'autre'
    check (categorie in ('comprehension','action','ecoute','serveur','systeme','utilisation','autre')),

  titre text not null,
  -- Le message technique, la trace, la réponse fautive : ce qu'on lit pour
  -- comprendre, pas ce qu'on lit pour trouver.
  detail text,
  -- Ce qui se passait : la phrase dictée, l'écran, l'action tentée.
  contexte text,
  -- D'où elle vient : 'manuel' (Raphaël la signale), 'app', 'voix', 'live'…
  source text not null default 'app',

  statut text not null default 'nouveau'
    check (statut in ('nouveau','en_cours','corrige','ignore')),

  -- La note de correction : ce qu'il aurait fallu faire. C'est elle qui sert
  -- à l'entraînement, et elle part dans le chantier créé depuis l'erreur.
  correction text,
  -- Le chantier ouvert depuis cette erreur, s'il existe.
  dev_item_id uuid references dev_items (id) on delete set null,

  -- Regroupement : deux signalements de même empreinte sont la même erreur.
  empreinte text not null,
  occurrences integer not null default 1,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  -- Renseignée quand une erreur déjà corrigée ou ignorée ressurgit.
  reapparue_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists jarvis_erreurs_empreinte_unique
  on jarvis_erreurs (user_id, empreinte);
create index if not exists jarvis_erreurs_user_vues
  on jarvis_erreurs (user_id, statut, last_seen desc);

alter table jarvis_erreurs enable row level security;

create policy "jarvis_erreurs_select_own" on jarvis_erreurs
  for select using ((select auth.uid()) = user_id);
create policy "jarvis_erreurs_insert_own" on jarvis_erreurs
  for insert with check ((select auth.uid()) = user_id);
create policy "jarvis_erreurs_update_own" on jarvis_erreurs
  for update using ((select auth.uid()) = user_id);
create policy "jarvis_erreurs_delete_own" on jarvis_erreurs
  for delete using ((select auth.uid()) = user_id);

-- L'empreinte : la catégorie et le titre débarrassés de ce qui change d'une
-- fois sur l'autre — chiffres (identifiants, durées, codes), accents,
-- ponctuation. « Impossible de modifier le chantier (délai dépassé, 8012 ms) »
-- et « Impossible de modifier le chantier (délai dépassé, 9310 ms) » sont la
-- même erreur ; sans ce nettoyage elles feraient deux lignes, puis dix.
-- (La classe [̀-ͯ] ci-dessous contient les marques combinantes
-- U+0300 a U+036F en clair : ce sont les accents detaches par normalize(nfd).
-- Ne pas les "nettoyer" en croyant a des caracteres parasites.)
create or replace function empreinte_erreur(p_categorie text, p_titre text)
returns text
language sql
immutable
strict
set search_path = public, pg_temp
as $$
  select p_categorie || ':' || trim(regexp_replace(
    regexp_replace(
      lower(regexp_replace(normalize(p_titre, nfd), '[̀-ͯ]', '', 'g')),
      '[^a-z ]', ' ', 'g'
    ),
    '\s+', ' ', 'g'
  ));
$$;

-- Le seul chemin d'écriture automatique. Silencieux par construction : il ne
-- doit jamais faire échouer l'action qui l'appelle — c'est un registre, pas
-- une donnée métier.
create or replace function signaler_erreur(
  p_categorie text,
  p_titre text,
  p_detail text default null,
  p_contexte text default null,
  p_source text default 'app'
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  cat text := coalesce(nullif(trim(p_categorie), ''), 'autre');
  titre text := left(trim(coalesce(p_titre, '')), 200);
  id_erreur uuid;
begin
  if titre = '' then
    return null;
  end if;
  if cat not in ('comprehension','action','ecoute','serveur','systeme','utilisation','autre') then
    cat := 'autre';
  end if;

  insert into jarvis_erreurs (categorie, titre, detail, contexte, source, empreinte)
  values (cat, titre, left(p_detail, 2000), left(p_contexte, 1000),
          coalesce(nullif(trim(p_source), ''), 'app'), empreinte_erreur(cat, titre))
  on conflict (user_id, empreinte) do update
  set occurrences = jarvis_erreurs.occurrences + 1,
      last_seen = now(),
      updated_at = now(),
      -- Le dernier détail vu remplace l'ancien : c'est celui qu'on ira lire.
      detail = coalesce(left(excluded.detail, 2000), jarvis_erreurs.detail),
      contexte = coalesce(left(excluded.contexte, 1000), jarvis_erreurs.contexte),
      -- Une erreur qu'on croyait réglée et qui revient doit se revoir.
      statut = case when jarvis_erreurs.statut in ('corrige','ignore') then 'nouveau'
                    else jarvis_erreurs.statut end,
      reapparue_at = case when jarvis_erreurs.statut in ('corrige','ignore') then now()
                          else jarvis_erreurs.reapparue_at end
  returning id into id_erreur;

  return id_erreur;
end;
$$;
