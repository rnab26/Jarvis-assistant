-- Retrouver une CONVERSATION passée, pas seulement un fait.
--
-- La table `echanges` gardait déjà le mot-à-mot des sept derniers jours, mais
-- personne ne la relisait jamais : « on avait parlé de quoi pour la villa
-- Dan ? » restait sans réponse alors que la réponse était en base. Les
-- souvenirs, eux, sont des faits courts — ils ne disent pas ce qui a été dit.
--
-- Même mécanique que pour les souvenirs, appliquée aux échanges : une
-- empreinte gte-small (384 dimensions, calculée gratuitement dans l'Edge
-- Function) et une recherche par le sens.
--
-- Ce qui NE change pas : la purge à sept jours reste la règle, c'est le choix
-- de Raphaël sur le mot-à-mot. Cette migration ne fait pas garder les échanges
-- plus longtemps, elle rend lisibles ceux qui sont là.

alter table echanges add column if not exists embedding extensions.vector(384);

-- hnsw, comme pour les souvenirs : rien à recalculer quand le volume grossit.
-- Le volume reste petit par construction (sept jours glissants).
create index if not exists echanges_embedding_idx on echanges
  using hnsw (embedding extensions.vector_cosine_ops);

-- Les échanges déjà en base n'ont pas d'empreinte : elles se calculent dans
-- l'Edge Function (Supabase.ai), pas en SQL. `memoriser()` en rattrape
-- quelques-unes à chaque phrase — d'où cet index, qui rend ce rattrapage
-- immédiat au lieu de balayer la table.
create index if not exists echanges_sans_empreinte_idx on echanges (user_id, created_at)
  where embedding is null;

-- Recherche par le sens dans le mot-à-mot.
--
-- Le seuil est plus HAUT que celui des souvenirs (0,25) et c'est voulu : une
-- phrase de conversation entière ressemble à n'importe quelle autre phrase de
-- conversation (mesuré le 4 sept. sur les vraies données : deux souvenirs sans
-- le moindre rapport sont à 0,90 de proximité avec gte-small). Trop bas, on
-- remonterait trois bavardages au hasard à chaque question et on gonflerait le
-- contexte envoyé à Gemini pour rien.
create or replace function chercher_echanges(
  p_embedding extensions.vector(384),
  p_limite int default 3,
  p_seuil float default 0.75
)
returns table (id uuid, transcript text, reponse text, created_at timestamptz, proximite float)
language sql
stable
security invoker
set search_path = public, extensions, pg_temp
as $$
  select e.id,
         e.transcript,
         e.reponse,
         e.created_at,
         1 - (e.embedding operator(extensions.<=>) p_embedding) as proximite
  from echanges e
  where e.user_id = (select auth.uid())
    and e.embedding is not null
    and 1 - (e.embedding operator(extensions.<=>) p_embedding) > p_seuil
  order by e.embedding operator(extensions.<=>) p_embedding
  limit least(p_limite, 10);
$$;

-- Les échanges sans empreinte, les plus récents d'abord : ce sont eux qui
-- ont le plus de chances d'être redemandés, et les plus vieux disparaîtront
-- de toute façon à la purge.
create or replace function echanges_a_empreindre(p_limite int default 5)
returns table (id uuid, transcript text, reponse text)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select e.id, e.transcript, e.reponse
  from echanges e
  where e.user_id = (select auth.uid())
    and e.embedding is null
  order by e.created_at desc
  limit least(p_limite, 20);
$$;
