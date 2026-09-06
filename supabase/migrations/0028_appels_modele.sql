-- Ce que Jarvis consomme, écrit en base et plus seulement dans les journaux.
--
-- RENUMÉROTÉE 0025 → 0028 le 6 sept. 2026 : la session « Le cockpit » a livré
-- 0025_visites_cockpit.sql dans le tronc pendant que celle-ci portait le même
-- numéro. Les deux étaient déjà appliquées et ne se touchent pas ; c'est le
-- numéro en double qui devait partir, pour que l'ordre reste lisible.
--
-- Chantier 5ac4d12c. Sa demande, dictée le 5 sept. 2026 à 17h59 : « savoir
-- combien il me reste de crédit et à combien de temps de discussion ça
-- équivaut, et le noter constamment ».
--
-- CE QU'IL N'Y A PAS, ET QU'IL FAUT LUI DIRE PLUTÔT QUE D'INVENTER : Jarvis
-- tourne sur l'offre GRATUITE de l'API Gemini (sa décision du 3 sept.). Il n'y
-- a donc aucun solde en argent. Ce qui existe, et qui l'a réellement laissé
-- sans Jarvis deux fois, ce sont des PLAFONDS — en requêtes par minute et par
-- jour, comptés par modèle et par projet. La question « combien il me reste »
-- se répond donc en phrases, pas en euros.
--
-- POURQUOI UNE TABLE. La ligne « coût » des journaux de la fonction donne déjà
-- la consommation de chaque appel, mais les journaux Supabase ne se lisent pas
-- depuis l'app, ne se totalisent pas, et s'effacent. Tant que ce n'est pas
-- recopié en base, il n'y a strictement rien à afficher — c'est la première
-- chose que la note du chantier demandait de vérifier.

create table if not exists public.appels_modele (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  at timestamptz not null default now(),

  fournisseur text not null,
  -- « commande » = une phrase de Raphaël. « memoire » = l'extraction de
  -- souvenirs, qui part toute seule après coup. Les deux consomment, mais une
  -- seule des deux est une phrase qu'il a dite : les confondre ferait afficher
  -- le double de ce qu'il a réellement demandé.
  role text not null check (role in ('commande', 'memoire')),
  -- Le modèle qui a RÉPONDU, pas celui qu'on a demandé. C'est la seule façon
  -- de voir qu'on tourne sur un secours depuis trois jours.
  modele text not null,

  statut integer not null,
  -- Quel plafond a refusé, quand refus il y a. Un 429 « minute » se lève tout
  -- seul en soixante secondes ; un 429 « jour » laisse Jarvis muet jusqu'au
  -- lendemain. Les deux se ressemblent, et c'est ce qui a fait perdre du temps
  -- le 3 sept. — on croyait à une saturation passagère.
  seau text check (seau in ('minute', 'jour', 'autre')),

  entree integer,
  sortie integer,
  reflexion integer,
  cache_lu integer,
  ms integer,

  -- Un appel de NOS vérifications, pas une phrase de Raphaël. Sans cette
  -- colonne, une passe de verifier-commande-vocale.mjs ferait afficher
  -- quarante phrases qu'il n'a jamais dites — et le chiffre ne voudrait plus
  -- rien dire le jour où il compte dessus.
  essai boolean not null default false,

  -- Le RANG du modèle dans la chaîne : 0 = le principal, 1 = premier secours…
  --
  -- C'est un fait que seul le SERVEUR connaît : le modèle principal se règle
  -- par le secret GEMINI_MODELE, que l'app ne peut pas lire. Sans cette
  -- colonne, l'écran devrait deviner quel nom est le principal — et se
  -- tromperait en silence le jour où le secret change, c'est-à-dire
  -- exactement le jour où il faut savoir qu'on tourne sur un secours.
  rang smallint
);

-- Rejouable sur une base où la table existe déjà sans la colonne.
alter table public.appels_modele add column if not exists rang smallint;

create index if not exists appels_modele_recent
  on public.appels_modele (user_id, at desc);

alter table public.appels_modele enable row level security;

drop policy if exists "appels modèle : les siens" on public.appels_modele;
create policy "appels modèle : les siens" on public.appels_modele
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Écrit un appel. `security definer` parce qu'elle est appelée depuis la Edge
-- Function avec le jeton de l'utilisateur : elle ne peut écrire que sur lui.
--
-- ELLE NE DOIT JAMAIS FAIRE ÉCHOUER CE QU'ELLE OBSERVE. Même règle que
-- `signaler_erreur` : la commande de Raphaël a déjà été exécutée et sa réponse
-- déjà donnée. Côté appelant, pas d'`await` et les erreurs sont avalées.
--
-- `drop` explicite avant chaque `create` : ajouter un paramètre, même avec une
-- valeur par défaut, ne REMPLACE pas la fonction — PostgreSQL en crée une
-- SURCHARGE, et PostgREST se retrouve devant deux candidates pour le même
-- appel. Et un `create or replace` qui change un type de retour est refusé
-- tout court. Sans ces deux lignes, rejouer cette migration échoue ou, pire,
-- laisse deux versions en place.
drop function if exists public.noter_appel_modele(
  text, text, text, integer, text, integer, integer, integer, integer, integer, boolean);
drop function if exists public.noter_appel_modele(
  text, text, text, integer, text, integer, integer, integer, integer, integer, boolean, smallint);
create or replace function public.noter_appel_modele(
  p_fournisseur text,
  p_role text,
  p_modele text,
  p_statut integer,
  p_seau text default null,
  p_entree integer default null,
  p_sortie integer default null,
  p_reflexion integer default null,
  p_cache_lu integer default null,
  p_ms integer default null,
  p_essai boolean default false,
  p_rang smallint default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.appels_modele (
    user_id, fournisseur, role, modele, statut, seau,
    entree, sortie, reflexion, cache_lu, ms, essai, rang
  ) values (
    coalesce(auth.uid(), (select user_id from public.dev_items order by created_at limit 1)),
    p_fournisseur, p_role, p_modele, p_statut, p_seau,
    p_entree, p_sortie, p_reflexion, p_cache_lu, p_ms, p_essai, p_rang
  );
end;
$$;

-- L'état de la consommation depuis une date, regroupé par rôle et par modèle.
--
-- Regroupé côté SQL exprès : sur une journée chargée il y a des centaines de
-- lignes, et les tirer toutes pour les additionner dans le téléphone serait
-- lent pour rien. Ce que ces nombres VEULENT DIRE se décide ailleurs, dans
-- `src/lib/consommationModele.ts` — c'est du raisonnement, ça se vérifie hors
-- ligne, et ça n'a rien à faire dans une requête.
--
-- Les appels de vérification (`essai`) sont EXCLUS : ce ne sont pas ses
-- phrases.
drop function if exists public.etat_consommation(timestamptz);
create or replace function public.etat_consommation(p_depuis timestamptz)
returns table (
  role text,
  modele text,
  fournisseur text,
  appels bigint,
  reussis bigint,
  refus_minute bigint,
  refus_jour bigint,
  jetons_entree bigint,
  jetons_sortie bigint,
  jetons_reflexion bigint,
  ms_median integer,
  dernier_at timestamptz,
  rang smallint
) language sql stable security definer set search_path = public as $$
  select
    a.role,
    a.modele,
    a.fournisseur,
    count(*),
    count(*) filter (where a.statut = 200),
    count(*) filter (where a.seau = 'minute'),
    count(*) filter (where a.seau = 'jour'),
    coalesce(sum(a.entree), 0),
    coalesce(sum(a.sortie), 0),
    coalesce(sum(a.reflexion), 0),
    percentile_disc(0.5) within group (order by a.ms) filter (where a.statut = 200)::integer,
    max(a.at),
    min(a.rang)
  from public.appels_modele a
  where a.user_id = coalesce(auth.uid(), (select user_id from public.dev_items order by created_at limit 1))
    and a.at >= p_depuis
    and a.essai = false
  group by a.role, a.modele, a.fournisseur
  order by a.role, count(*) desc;
$$;
