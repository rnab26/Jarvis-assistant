-- Une réponse du journal de bord dit À QUOI elle répond.
--
-- Ses mots, dictés le 17 sept. 2026 à 07 h 57 : « Dans le cockpit dev :
-- journal de bord, incohérence sur la durée de consultation des conversations
-- et impossibilité de reprendre la discussion ».
--
-- MESURÉ le même matin, sur sa base : 304 entrées au journal sur 14,5 jours,
-- et UNE SEULE portait un bouton « Répondre » — le bouton n'apparaissait que
-- sur une question sans réponse. Les 303 autres (208 notes d'information,
-- 18 blocages, 42 réponses, 30 écrites par lui) n'offraient aucun moyen
-- d'enchaîner. D'où « impossibilité de reprendre la discussion ».
--
-- POURQUOI UNE COLONNE, ET PAS `item_id`. `item_id` dit sur quel CHANTIER
-- porte une entrée — plusieurs fils vivent sur le même chantier, et une
-- entrée peut n'en avoir aucun. Sans lien vers l'entrée précise, une réponse
-- à une note d'information retombait dans le flux sans que rien ne dise ce
-- qu'elle répondait : le défaut d'aujourd'hui, à l'envers.
--
-- `on delete set null` et pas `cascade` : effacer une question ne doit jamais
-- emporter la réponse de Raphaël, qui est souvent la seule trace de ce qu'il
-- a décidé.

alter table public.dev_log
  add column if not exists repond_a uuid references public.dev_log (id) on delete set null;

create index if not exists dev_log_repond_a on public.dev_log (repond_a);

-- Rattrapage de l'existant : les réponses déjà écrites n'ont pas de parent, et
-- on n'en invente pas. On ne rattache QUE ce dont on est sûr — une réponse et
-- la question qu'elle a refermée, sur le même chantier, à moins de deux
-- minutes d'écart. Deviner au-delà ferait dire au journal quelque chose de
-- faux, ce qui est pire que de ne rien dire.
update public.dev_log r
   set repond_a = q.id
  from public.dev_log q
 where r.repond_a is null
   and r.kind = 'reponse'
   and q.kind = 'question'
   and q.answered_at is not null
   and q.user_id = r.user_id
   and q.item_id is not distinct from r.item_id
   and abs(extract(epoch from (r.created_at - q.answered_at))) < 120;
