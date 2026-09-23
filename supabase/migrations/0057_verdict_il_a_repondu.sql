-- LE VERDICT `il_a_repondu` N'A JAMAIS PU S'ENREGISTRER UNE SEULE FOIS.
--
-- Mesuré le 23 sept. 2026, pas supposé. `deciderPasse` rend ce cinquième
-- verdict depuis le 15 sept. (migration 0046, réponse à sa phrase « J'ai
-- répondu dans l'application jarvis faut que tu sois au courant quand je
-- réponds »), mais la contrainte posée par la migration 0024 n'énumérait que
-- quatre valeurs et aucune migration ne l'a jamais élargie :
--
--   CHECK (verdict = ANY (ARRAY['travaille','eteint','occupe','rien_a_prendre']))
--
--   select verdict, count(*) from passes_autonomes group by verdict;
--     rien_a_prendre 40 | travaille 25 | occupe 6 | il_a_repondu 0
--
-- Conséquence, constatée à ce tir : la passe ne se retire pas, elle PLANTE
-- (23514, violation de contrainte) et n'écrit AUCUNE ligne. Vu de son
-- cockpit, ça ressemble exactement à « il n'y avait rien à faire » — c'est
-- la panne muette que `passes_autonomes` existe précisément pour rendre
-- visible. Il avait répondu 10 minutes plus tôt, à 12h06 ; 24 de ses
-- réponses depuis le 15 sept. n'ont donc jamais réveillé personne.
alter table public.passes_autonomes
  drop constraint passes_autonomes_verdict_check;

alter table public.passes_autonomes
  add constraint passes_autonomes_verdict_check
  check (verdict in ('travaille', 'eteint', 'occupe', 'rien_a_prendre', 'il_a_repondu'));

-- ET LA PASSE DOIT RESTER OUVERTE, comme `travaille`.
--
-- La 0024 refermait d'office toute passe qui n'était pas `travaille`, avec
-- pour raison écrite « elle n'a rien commencé ». C'est faux pour celle-ci :
-- `scripts/passe-autonome.ts` traite `il_a_repondu` exactement comme
-- `travaille` (code de sortie 0, « il y a du travail »), la session va lire
-- ses réponses et coder. Refermée à la seconde, elle ne dirait pas à la
-- suivante que la place est prise — et deux sessions partiraient en
-- parallèle, contre sa décision du 6 sept. 2026 : « Éviter de lancer une
-- session si une autre en est deja en cours ».
--
-- Corollaire pour la session : une passe `il_a_repondu` se referme avec
-- `--terminer`, comme une passe qui travaille. C'est écrit dans
-- docs/session-autonome.md.
create or replace function public.demarrer_passe_autonome(
  p_branche text,
  p_verdict text,
  p_raison text,
  p_item uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  insert into public.passes_autonomes (user_id, branche, verdict, raison, item_id,
                                       fini_at)
  values (public.proprietaire_du_cockpit(), p_branche, p_verdict, p_raison, p_item,
          -- Une passe qui se retire est finie à la seconde où elle s'ouvre :
          -- elle n'a rien commencé. Les deux verdicts qui donnent du travail
          -- restent ouverts, et ce sont eux qui disent aux suivantes que la
          -- place est prise.
          case when p_verdict in ('travaille', 'il_a_repondu') then null else now() end)
  returning id into v_id;
  return v_id;
end;
$$;
