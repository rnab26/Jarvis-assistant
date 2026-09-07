-- 0033 — un ordre pour les catégories de tâches, et de quoi les renommer.
--
-- SA DEMANDE, 7 sept. 2026, capture à l'appui : « ajouter dans l'écran
-- d'accueil un petit crayon [...] pour pouvoir bien évidemment renommer les
-- sections, les déplacer facilement avec un drag and drop pour mieux organiser
-- le panel visuel de jarvis ».
--
-- La table n'avait que id / user_id / name / created_at : l'ordre affiché était
-- donc l'ordre de CRÉATION, que rien ne pouvait changer. « Admin » se
-- retrouvait au milieu parce qu'elle avait été créée là, pas parce qu'elle y
-- avait sa place.
--
-- POSITION EST NULLABLE, ET C'EST VOULU : les catégories existantes gardent
-- l'ordre qu'il connaît (par created_at) tant qu'il n'a rien réorganisé.
-- Poser d'office une position sur tout aurait pu réordonner son écran sans
-- qu'il ait rien demandé — l'app se serait réarrangée toute seule au premier
-- lancement, ce qui est exactement ce qu'on veut éviter.

alter table public.categories
  add column if not exists position integer;

-- L'ordre d'affichage est donc « position d'abord si elle existe, sinon la
-- date de création » — les deux clients (liste et filtre) trient pareil.
comment on column public.categories.position is
  'Ordre choisi par Raphaël (crayon de l''écran Tâches). NULL = jamais réorganisée, on retombe sur created_at.';

create index if not exists categories_user_position_idx
  on public.categories (user_id, position nulls last, created_at);
