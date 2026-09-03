-- Exécution de SQL arbitraire depuis les sessions Claude Code, sans validation manuelle.
--
-- Pourquoi : l'outil MCP Supabase marque execute_sql comme « exige une interaction
-- humaine ». Ce marqueur vient du serveur MCP lui-même : le pop-up s'affiche à chaque
-- appel même en mode auto et même en bypassPermissions, aucune règle d'autorisation ne
-- le saute, et il n'offre jamais « ne plus demander ». Raphaël travaille depuis son
-- téléphone et refuse de cliquer à chaque requête ; la seule sortie est de ne plus
-- passer par cet outil. Les sessions appellent donc cette fonction en HTTPS via
-- scripts/sql.sh, ce qui passe par Bash et ne déclenche aucune validation.
--
-- CE QUE ÇA OUVRE, en toutes lettres : quiconque détient la clé service_role peut
-- exécuter n'importe quel SQL sur ce projet, DDL et suppressions comprises, sans
-- qu'aucune trace ne s'affiche à Raphaël. Décision explicite de sa part le 3 sept.
-- 2026, après lui avoir présenté l'alternative plus sûre (fonctions dédiées par
-- opération) et le risque de celle-ci. La règle du CLAUDE.md reste entière : on lui
-- demande avant toute opération destructrice (drop, delete massif, truncate).
--
-- La clé service_role n'est JAMAIS dans le dépôt : elle vit dans les variables
-- d'environnement de l'environnement cloud Claude Code.

create or replace function public.exec_sql(query text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  resultat jsonb;
begin
  -- Cas 1 : la requête renvoie des lignes (select, ou update ... returning).
  -- On l'enveloppe pour récupérer le résultat en JSON.
  execute format('select coalesce(jsonb_agg(t), ''[]''::jsonb) from (%s) as t', query)
    into resultat;
  return jsonb_build_object('ok', true, 'rows', resultat);

exception
  -- 42601 = erreur de syntaxe. C'est ce que produit l'enveloppe quand la requête n'est
  -- pas un select : DDL, update sans returning, ou plusieurs instructions à la suite.
  -- Postgres échoue à l'analyse, donc AVANT toute exécution : rien n'a eu lieu, on peut
  -- relancer la requête telle quelle sans risque de double effet.
  when syntax_error then
    begin
      execute query;
      return jsonb_build_object('ok', true, 'rows', null, 'note', 'exécuté sans résultat');
    exception when others then
      return jsonb_build_object('ok', false, 'error', sqlerrm, 'sqlstate', sqlstate);
    end;

  -- Toute autre erreur est une vraie erreur d'exécution (contrainte violée, table
  -- inconnue...). On la renvoie sans réessayer : relancer pourrait rejouer un effet
  -- de bord déjà appliqué.
  when others then
    return jsonb_build_object('ok', false, 'error', sqlerrm, 'sqlstate', sqlstate);
end;
$fn$;

-- Verrouillage des accès. La fonction est SECURITY DEFINER : elle s'exécute avec les
-- droits de son propriétaire. Elle ne doit donc être appelable QUE par service_role.
-- Surtout pas par anon ni authenticated : la clé anon est publique, elle est dans le
-- code de l'app installée sur le téléphone.
revoke all on function public.exec_sql(text) from public;
revoke all on function public.exec_sql(text) from anon;
revoke all on function public.exec_sql(text) from authenticated;
grant execute on function public.exec_sql(text) to service_role;

comment on function public.exec_sql(text) is
  'SQL arbitraire pour les sessions Claude Code (service_role uniquement). Voir 0010_exec_sql.sql.';
