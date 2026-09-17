-- 0051 — la carte Consommation affiche le VRAI plafond vu, pas une mesure figée.
--
-- Chantier fbdf9467. Raphaël, 17 sept. 2026 (chat + capture) : « c'est pas du
-- tout precis faut mettre un vrai compteur de consommation precis ». Le
-- bandeau Live disait « Quota du jour vide » pendant que la carte Paramètres
-- affichait encore des chiffres vagues, sans dire LEQUEL des trois modèles
-- (principal/secours 1/secours 2) est à sec ni le plafond réel.
--
-- LE DÉFAUT : Google renvoie le plafond EXACT dans le corps de chaque 429
-- (quotaId + quotaValue, lus dans `_shared/gemini.ts#lireQuota`) et
-- `modele.ts` le reçoit déjà dans `EchecBrut.quota` — mais `seauDuRefus()`
-- le réduisait aussitôt à une seule des trois cases « minute »/« jour »/
-- « autre » avant d'écrire dans `appels_modele` (colonne `seau`, texte). Le
-- chiffre exact et l'identifiant du seau touché n'étaient jamais persistés.
--
-- `seau` reste tel quel : `moteur-veille` et `resumerConsommation` en ont
-- besoin pour distinguer « ça se lève en 60 s » de « c'est mort jusqu'à
-- demain ». On AJOUTE l'information précise à côté, on ne la remplace pas.

alter table public.appels_modele add column if not exists quota_id text;
alter table public.appels_modele add column if not exists quota_limite text;

-- Le DROP vient d'abord : ajouter des paramètres change la signature, donc
-- `create or replace` créerait une SURCHARGE au lieu de remplacer — les deux
-- coexisteraient et un appel par nom deviendrait ambigu. Même piège déjà payé
-- dans la migration 0031.
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
  p_rang smallint default null,
  -- Le quotaId et le quotaValue EXACTS lus dans le corps du 429, quand Google
  -- en a donné un. `null` sur un succès, sur un échec sans quota (403, 500…),
  -- ou sur un ancien appelant qui ne les passe pas encore.
  p_quota_id text default null,
  p_quota_limite text default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.appels_modele (
    user_id, fournisseur, role, modele, statut, seau,
    entree, sortie, reflexion, cache_lu, ms, essai, rang, quota_id, quota_limite
  ) values (
    coalesce(auth.uid(), (select user_id from public.dev_items order by created_at limit 1)),
    p_fournisseur, p_role, p_modele, p_statut, p_seau,
    p_entree, p_sortie, p_reflexion, p_cache_lu, p_ms, p_essai, p_rang, p_quota_id, p_quota_limite
  );
end;
$$;

-- `etat_consommation()` gagne le DERNIER quota_id/quota_limite vu par groupe
-- (rôle, modèle, fournisseur) — le plus récent, jamais un agrégat : un
-- plafond ne se moyenne pas, et seul le dernier refus dit l'état du jour.
--
-- `array_agg(... order by at desc) filter (where quota_id is not null)) [1]`
-- rend le premier élément non nul une fois trié du plus récent au plus
-- ancien — donc le dernier quota VU, même si des appels réussis (sans quota)
-- se sont produits après. `dernier_quota_at` porte sa propre date : un refus
-- vieux de trois jours ne doit pas se lire comme celui de ce matin.
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
  rang smallint,
  dernier_quota_id text,
  dernier_quota_limite text,
  dernier_quota_at timestamptz
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
    min(a.rang),
    (array_agg(a.quota_id order by a.at desc) filter (where a.quota_id is not null))[1],
    (array_agg(a.quota_limite order by a.at desc) filter (where a.quota_id is not null))[1],
    (array_agg(a.at order by a.at desc) filter (where a.quota_id is not null))[1]
  from public.appels_modele a
  where a.user_id = coalesce(auth.uid(), (select user_id from public.dev_items order by created_at limit 1))
    and a.at >= p_depuis
    and a.essai = false
  group by a.role, a.modele, a.fournisseur
  order by a.role, count(*) desc;
$$;
