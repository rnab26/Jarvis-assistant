-- La politique qui manquait, et le bug silencieux qu'elle a causé.
--
-- CONSTATÉ le 5 sept. 2026 sur les vraies données de Raphaël : les 75 échanges
-- antérieurs au chantier caa54df2 n'avaient TOUJOURS aucune empreinte, alors
-- que `rattraperEmpreintes` en traite dix à chaque phrase depuis la veille.
-- Aucune erreur nulle part, ni dans les journaux de la fonction, ni dans le
-- registre des erreurs.
--
-- LA CAUSE : `echanges` avait des politiques SELECT, INSERT et DELETE
-- (migration 0006) mais AUCUNE pour UPDATE — la table n'était jamais mise à
-- jour à l'époque. La migration 0018 y a ajouté la colonne `embedding`, donc
-- une écriture, sans ajouter la politique qui va avec. RLS ne refuse pas
-- bruyamment un UPDATE : il RESTREINT la sélection des lignes. L'écriture
-- touche zéro ligne, PostgREST rend un succès, et le code n'a rien à
-- attraper.
--
-- C'est la même famille que tout le reste de ce chantier — « une panne qui se
-- lit comme une absence » — mais côté base cette fois : le garde-fou qui lit
-- le code ne pouvait pas la voir, puisque le code était juste.
--
-- LEÇON, pour la prochaine migration qui ajoute une colonne : vérifier que la
-- table a bien la politique correspondant à l'écriture qu'on introduit.

create policy "echanges_update_own" on echanges
  for update using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
