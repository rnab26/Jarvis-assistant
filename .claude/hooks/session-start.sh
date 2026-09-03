#!/usr/bin/env bash
# Injecte l'état vivant du cockpit dans le contexte, à chaque démarrage de session.
#
# Pourquoi : Raphaël ne veut plus coller un prompt du type « lis les chantiers et
# le journal » à chaque ouverture de session. Ce hook le fait à sa place. Il lit
# la BASE, pas un fichier : le contenu est donc toujours à jour, même si le dépôt
# n'a pas bougé depuis des jours.
#
# Le hook ne doit JAMAIS faire échouer le démarrage d'une session. Toute erreur
# est rattrapée et transformée en note explicative dans le contexte.

set -uo pipefail

RACINE="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
SQL="$RACINE/scripts/sql.sh"

# Renvoie la première colonne texte de la première ligne, ou une chaîne vide.
# exec_sql renvoie tantôt un objet ({"bloc": "..."}), tantôt une chaîne nue quand
# la requête n'a qu'une colonne : on accepte les deux formes.
interroger() {
  "$SQL" "$1" 2>/dev/null \
    | jq -r 'if (.rows | type) != "array" or (.rows | length) == 0 then ""
             else (.rows[0] | if type == "object" then (to_entries[0].value // "") else (. // "") end)
             end' 2>/dev/null \
    || echo ""
}

emettre() {
  jq -n --arg c "$1" \
    '{hookSpecificOutput: {hookEventName: "SessionStart", additionalContext: $c}}'
}

if [ ! -x "$SQL" ]; then
  emettre "Cockpit non chargé : $SQL est introuvable ou non exécutable. Lis les chantiers et le journal à la main (voir CLAUDE.md)."
  exit 0
fi

# Pas de contrôle de la clé ici : l'authentification peut venir soit d'une
# variable d'environnement, soit d'un en-tête posé par le proxy (« API
# credential »), auquel cas rien n'est visible depuis la session. On tente la
# requête et on juge sur le résultat.

# Groupés par thème, pas à plat : un sujet se traite en entier, pas chantier
# par chantier. Les thèmes qui contiennent de la priorité haute passent devant.
chantiers=$(interroger "select coalesce(string_agg(bloc, chr(10) || chr(10) order by urgence, taille desc, th), '(aucun)') as t from (select coalesce(nullif(trim(theme), ''), 'À classer') as th, min(case when priority = 'high' then 1 else 2 end) as urgence, count(*) as taille, '### ' || coalesce(nullif(trim(theme), ''), 'À classer') || ' (' || count(*) || ')' || chr(10) || string_agg(format('- %s | %s | %s | %s%s%s', id, title, status, priority, case when claimed_by is not null and claim_expires_at > now() then ' | PRIS PAR ' || claimed_by else '' end, case when coalesce(notes, '') <> '' then chr(10) || '    ' || left(replace(notes, chr(10), ' '), 160) else '' end), chr(10) order by priority desc, created_at) as bloc from dev_items where archived_at is null group by 1) g")

journal=$(interroger "select coalesce(string_agg(format('- %s | %s | %s%s%s', to_char(created_at, 'DD/MM HH24:MI'), author, kind, case when answered_at is not null then ' (repondu)' else '' end, chr(10) || '    ' || left(replace(body, chr(10), ' '), 300)), chr(10) order by created_at desc), '(vide)') as t from (select * from dev_log order by created_at desc limit 12) d")

livres=$(interroger "select coalesce(string_agg(format('- %s (%s)', title, to_char(archived_at, 'DD/MM')), chr(10) order by archived_at desc), '(aucun)') as t from (select * from dev_items where archived_at is not null order by archived_at desc limit 8) a")

if [ -z "$chantiers" ] && [ -z "$journal" ]; then
  emettre "Cockpit non chargé : la base n'a rien renvoyé. Réessaie à la main avec scripts/sql.sh et dis-le à Raphaël si ça échoue encore."
  exit 0
fi

contexte=$(cat <<FIN
# État du projet au démarrage de cette session

Chargé automatiquement depuis la base. Raphaël n'a rien eu à te demander : ne lui
fais donc pas répéter ce qui est déjà écrit ci-dessous. Les notes sont tronquées —
utilise \`scripts/sql.sh\` pour le détail complet d'un chantier.

## Chantiers en cours, groupés par thème
Format : id | titre | statut | priorité | réservation
Marqueurs en tête des notes : [À CADRER AVEC RAPHAËL AVANT DE COMMENCER] = ne pas
coder, en discuter d'abord. [LIBRE] = à prendre sans rien demander.

Prends un THÈME, pas un chantier isolé : c'est la demande explicite de Raphaël,
qui en a assez des correctifs ponctuels posés en pansement. Les chantiers d'un
même thème partagent presque toujours la même cause racine.

${chantiers:-(non chargé)}

## Journal de bord (12 dernières entrées, plus récente en premier)
Consignes de Raphaël et messages des autres sessions.

${journal:-(non chargé)}

## Derniers chantiers livrés
Ne les refais pas, ne les défais pas.

${livres:-(non chargé)}

## Avant de te mettre au travail
- Réserve chaque chantier avant d'y toucher : \`scripts/sql.sh "select claim_dev_item('<id>', '<ta branche>', 120)"\`
- Un chantier sans thème, classe-le en le traitant : \`update dev_items set theme = '...' where id = '...'\`
- Tout le SQL passe par \`scripts/sql.sh\`, jamais par l'outil MCP Supabase (il impose une validation manuelle à Raphaël à chaque appel).
- Avant de t'arrêter, écris ton état dans \`dev_log\` ou dans les notes du chantier.
- La méthode de travail générale de Raphaël est dans \`docs/methode-de-travail.md\`.
FIN
)

emettre "$contexte"
