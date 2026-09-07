-- Compacter les vieilles conversations au lieu de les effacer.
--
-- Chantier 470d9c4d, moitié restante de la fiche 4e952f48 (5 sept. 2026) :
-- « Illimité mais ultra compacter pour comprendre le nécessaire ». La
-- migration 0023 a livré la première moitié (la rétention devient un réglage,
-- défaut SANS LIMITE — supprimer est irréversible, garder ne l'est pas). Cette
-- migration livre la seconde : au-delà d'un certain âge, un échange est
-- RÉSUMÉ plutôt que supprimé, pour que « sans limite » reste tenable sans
-- perdre ce qui compte. `chercher_echanges()` (migration 0018) doit continuer
-- à le retrouver par le sens — le résumé reçoit sa propre empreinte.
--
-- Le compactage n'est PAS la purge : avec le défaut « sans limite », rien
-- n'est jamais supprimé. Le compactage sert à ce que « sans limite » reste
-- vivable, pas à faire de la place avant une suppression.

-- Un échange déjà compacté : son `transcript` est un résumé, pas le mot-à-mot
-- d'origine. Distinct de `source` (migration 0034, qui dit PAR OÙ la commande
-- est passée) : les deux se combinent librement.
alter table public.echanges
  add column if not exists resume boolean not null default false;

comment on column public.echanges.resume is
  'Vrai quand transcript porte un résumé compact plutôt que le mot-à-mot d''origine (chantier 470d9c4d). Le compactage ne supprime jamais une ligne, il la réécrit.';

-- Les candidats au compactage : assez vieux, pas encore résumés. Les plus
-- anciens d'abord, comme `echanges_a_empreindre` — ce sont eux qui pèsent le
-- plus sur « sans limite » depuis le plus longtemps.
create or replace function public.echanges_a_compacter(p_age_jours int default 21, p_limite int default 15)
returns table (id uuid, transcript text, reponse text, created_at timestamptz)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select e.id, e.transcript, e.reponse, e.created_at
  from public.echanges e
  where e.user_id = (select auth.uid())
    and e.resume = false
    and e.created_at < now() - make_interval(days => greatest(p_age_jours, 1))
  order by e.created_at asc
  limit least(p_limite, 50);
$$;

-- Le résumé retrouvable par le sens, comme le mot-à-mot qu'il remplace.
-- `resume` (booléen) dit à l'app et à la consigne qu'il s'agit d'un condensé,
-- pas d'une citation exacte.
drop function if exists public.chercher_echanges(extensions.vector, int, float);
create or replace function public.chercher_echanges(
  p_embedding extensions.vector(384),
  p_limite int default 3,
  p_seuil float default 0.75
)
returns table (id uuid, transcript text, reponse text, created_at timestamptz, resume boolean, proximite float)
language sql
stable
security invoker
set search_path = public, extensions, pg_temp
as $$
  select e.id,
         e.transcript,
         e.reponse,
         e.created_at,
         e.resume,
         1 - (e.embedding operator(extensions.<=>) p_embedding) as proximite
  from public.echanges e
  where e.user_id = (select auth.uid())
    and e.embedding is not null
    and 1 - (e.embedding operator(extensions.<=>) p_embedding) > p_seuil
  order by e.embedding operator(extensions.<=>) p_embedding
  limit least(p_limite, 10);
$$;

-- ── La trace des passes ─────────────────────────────────────────────────────
--
-- Même motif que `veilles_modele` (migration 0026) : PAS de pg_cron ni pg_net
-- sur ce projet (choix de sécurité qui n'est pas le nôtre), donc une passe
-- PARESSEUSE réveillée après une phrase, au plus une fois toutes les six
-- heures. Une passe qui ne trouve rien à compacter s'enregistre AUSSI : sans
-- ça, « rien à compacter aujourd'hui » et « le compactage ne tourne plus »
-- se ressemblent parfaitement. Table globale comme `veilles_modele` et
-- `moteur_choisi` : Jarvis n'a qu'un seul utilisateur.
create table if not exists public.compactages_memoire (
  id uuid primary key default gen_random_uuid(),
  demarre_at timestamptz not null default now(),
  -- « compacte », « rien_a_faire », « echec ».
  verdict text not null,
  nb_compactes integer not null default 0,
  detail text
);

alter table public.compactages_memoire enable row level security;
drop policy if exists "compactages : lecture" on public.compactages_memoire;
create policy "compactages : lecture" on public.compactages_memoire
  for select using (auth.role() = 'authenticated');

create or replace function public.dernier_compactage()
returns timestamptz
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select max(demarre_at) from public.compactages_memoire;
$$;

create or replace function public.enregistrer_compactage(p_verdict text, p_nb int, p_detail text)
returns uuid
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.compactages_memoire (verdict, nb_compactes, detail)
  values (p_verdict, coalesce(p_nb, 0), p_detail)
  returning id;
$$;
