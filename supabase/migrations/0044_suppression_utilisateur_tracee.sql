-- Supprimer un utilisateur qui possède un chantier échouait en 500.
--
-- REPRODUIT, PAS SUPPOSÉ (chantier fa60e2da, 8 sept. 2026). Un utilisateur de
-- test créé, un dev_items inséré, puis DELETE /auth/v1/admin/users/<id> :
--
--   500 {"code":"23503","message":"insert or update on table
--   \"dev_items_supprimes\" violates foreign key constraint
--   \"dev_items_supprimes_user_id_fkey\"","detail":"Key (user_id)=(…) is not
--   present in table \"users\"."}
--
-- LA CAUSE EST DANS LE DÉTAIL DU MESSAGE, et elle est nette : « is not present
-- in table users ». PostgreSQL supprime d'abord la ligne parente d'auth.users,
-- PUIS applique les actions référentielles. La cascade atteint dev_items, qui
-- déclenche le trigger BEFORE DELETE de la migration 0038 — lequel INSÈRE dans
-- dev_items_supprimes une ligne qui référence un utilisateur qui n'existe déjà
-- plus. La clé étrangère refuse, et tout le DELETE échoue.
--
-- CE QUE ÇA COÛTAIT, ET C'ÉTAIT SILENCIEUX : la plupart des scripts
-- `scripts/verifier-*.mjs` créent un utilisateur de test, écrivent, puis le
-- suppriment SANS lire le code de retour du DELETE. Le script restait vert et
-- laissait un compte orphelin. Mesuré ce jour-là : huit comptes
-- `%@jarvis-test.local` traînaient, dont deux avec 3 et 7 chantiers — neuf
-- chantiers d'essai que le hook de démarrage injectait dans le contexte de
-- CHAQUE session (il lit en service_role, donc hors RLS), et que
-- `etat_pour_passe_autonome()` voyait aussi.
--
-- LE CORRECTIF : on ne trace PAS la suppression d'un chantier dont le
-- propriétaire lui-même disparaît.
--
-- Ce n'est pas un contournement, c'est la bonne règle. La trace n'existe que
-- pour qu'on puisse RESTAURER (`restaurer_chantier_supprime`) et pour qu'on la
-- LISE — or sa politique RLS est `auth.uid() = user_id` : plus personne ne
-- pourra jamais lire ces lignes-là. Les garder ferait grossir la table de
-- lignes que rien ne peut ni afficher ni restaurer.
--
-- POURQUOI PAS RETIRER LA CLÉ ÉTRANGÈRE, qui aurait aussi « marché » : la
-- ligne survivrait, mais orpheline et invisible pour toujours — on aurait
-- remplacé une erreur bruyante par une fuite silencieuse. Et différer la
-- contrainte ne change rien : au COMMIT le parent est parti pour de bon.
--
-- CE QUI NE CHANGE PAS : une suppression ordinaire depuis le cockpit (bouton
-- « Choisir » › Supprimer) laisse toujours sa trace. C'est le seul cas qui
-- compte, et c'est celui de la migration 0038.

create or replace function public.tracer_suppression_dev_item()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Le propriétaire s'en va avec le chantier : rien à conserver, et rien qui
  -- pourrait être relu. Vrai UNIQUEMENT quand ce DELETE est une cascade
  -- venue d'auth.users — dans tous les autres cas la ligne est bien là.
  if not exists (select 1 from auth.users where id = old.user_id) then
    return old;
  end if;

  insert into public.dev_items_supprimes
    (item_id, user_id, title, notes, status, priority, theme, created_at, archived_at, supprime_par)
  values
    (old.id, old.user_id, old.title, old.notes, old.status, old.priority, old.theme,
     old.created_at, old.archived_at, old.claimed_by);
  return old;
end;
$$;
