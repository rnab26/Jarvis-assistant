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
chantiers=$(interroger "select coalesce(string_agg(bloc, chr(10) || chr(10) order by rang, urgence, taille desc, th), '(aucun)') as t from (select coalesce(nullif(trim(i.theme), ''), 'À classer') as th, min(coalesce(s.position, 900)) as rang, min(case when i.priority = 'high' then 1 else 2 end) as urgence, count(*) as taille, '### ' || coalesce(nullif(trim(i.theme), ''), 'À classer') || ' (' || count(*) || ')' || chr(10) || string_agg(format('- %s | %s | %s | %s%s%s', i.id, i.title, i.status, i.priority, case when i.claimed_by is not null and i.claim_expires_at > now() then ' | PRIS PAR ' || i.claimed_by else '' end, case when coalesce(i.notes, '') <> '' then chr(10) || '    ' || left(replace(i.notes, chr(10), ' '), 160) else '' end), chr(10) order by i.priority desc, i.created_at) as bloc from dev_items i left join dev_sections s on cle_section(s.nom) = cle_section(coalesce(nullif(trim(i.theme), ''), '~')) where i.archived_at is null group by 1) g")

# Ce que Jarvis rate, et ce que Raphaël a écrit qu'il aurait fallu faire. Les
# corrections vivent en base pour être lues ici : une note de correction qui ne
# remonte jusqu'à personne ne corrige rien (chantier f2f6667f).
erreurs=$(interroger "select coalesce(string_agg(format('- [%s] %s (vue %s fois, %s)%s%s', categorie, titre, occurrences, to_char(last_seen, 'DD/MM HH24:MI'), case when coalesce(correction, '') <> '' then chr(10) || '    correction attendue : ' || left(replace(correction, chr(10), ' '), 200) else '' end, case when reapparue_at is not null then chr(10) || '    REVENUE APRES CORRECTION' else '' end), chr(10) order by occurrences desc, last_seen desc), '(aucune)') as t from (select * from jarvis_erreurs where statut in ('nouveau', 'en_cours') order by occurrences desc, last_seen desc limit 8) e")

# CE QUE JARVIS A RATÉ PLUSIEURS FOIS ET QUE PERSONNE N'A PRIS (chantier
# 25a58902). Raphaël demandait « signaler automatiquement aux sessions Claude
# Code un rapport pour qu'elles corrigent » : le voici. Ne remontent que les
# échecs de COMPRÉHENSION et d'ACTION — un refus du modèle ou une écriture qui
# a raté n'apprend rien à une session — vus au moins deux fois, sans note de
# correction et sans chantier ouvert. C'est exactement le reste : ce que
# personne ne regarde.
echecs=$(interroger "select coalesce(string_agg(format('- [%s] %s — %s fois, la derniere le %s%s', categorie, titre, occurrences, to_char(last_seen, 'DD/MM HH24:MI'), case when coalesce(contexte, '') <> '' then chr(10) || '    ce qui se passait : ' || left(replace(contexte, chr(10), ' '), 250) else '' end), chr(10) order by occurrences desc, last_seen desc), '(aucun)') as t from (select * from jarvis_erreurs where categorie in ('comprehension', 'action') and statut in ('nouveau', 'en_cours') and occurrences >= 2 and coalesce(correction, '') = '' and dev_item_id is null order by occurrences desc, last_seen desc limit 6) e")

# CE QUI ATTEND UNE DÉCISION DE RAPHAËL — le remplacement des fiches publiées
# hors du dépôt (chantier 85ae62b5). Une question posée avec
# scripts/demander.sh vit dans dev_log, s'affiche en tête de son cockpit, et
# revient ici tant qu'il n'y a pas répondu : aucune session ne peut la reposer
# sans le savoir, et aucune ne peut avancer en croyant qu'elle est tranchée.
attentes=$(interroger "select coalesce(string_agg(format('- %s | %s | pose le %s%s%s%s%s%s', case when kind = 'action' then 'IL DOIT LE FAIRE' else 'IL DOIT DECIDER' end, author, to_char(created_at, 'DD/MM HH24:MI'), case when item_id is not null then ' | chantier ' || item_id else '' end, chr(10) || '    ' || left(replace(body, chr(10), ' '), 300), case when coalesce(pourquoi, '') <> '' then chr(10) || '    pourquoi : ' || left(replace(pourquoi, chr(10), ' '), 200) else '' end, case when jsonb_typeof(options) = 'array' then chr(10) || '    options proposees : ' || (select string_agg(o->>'libelle' || case when o->>'recommande' = 'true' then ' (recommandee)' else '' end, ' | ') from jsonb_array_elements(options) o) else '' end, case when coalesce(etat, '') <> '' then chr(10) || '    ou il en est : ' || etat else '' end), chr(10) order by case when kind = 'action' then 0 else 1 end, created_at), '(rien)') as t from dev_log where answered_at is null and kind in ('question', 'action')")

# SES RÉPONSES, à part et sur une fenêtre plus large que le journal : c'est ce
# qu'on lui a fait répéter trois fois. Le journal n'en injecte que douze
# entrées, toutes familles confondues — une réponse donnée avant-hier en
# sortait, et la question se reposait.
reponses=$(interroger "select coalesce(string_agg(format('- %s%s%s', to_char(created_at, 'DD/MM HH24:MI'), case when item_id is not null then ' | chantier ' || item_id else '' end, chr(10) || '    ' || left(replace(body, chr(10), ' '), 400) || case when photo_chemin is not null then chr(10) || '    capture jointe : ' || photo_chemin || ' (scripts/photo.sh pour la recuperer)' else '' end), chr(10) order by created_at desc), '(aucune)') as t from (select * from dev_log where kind = 'reponse' and author ilike 'rapha%' order by created_at desc limit 12) r")

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

## Ce qui attend une DÉCISION de Raphaël
Posé par une session avec \`scripts/demander.sh\`, affiché en tête de son
cockpit. Tant que c'est là, il n'a pas répondu : **ne repose aucune de ces
questions ailleurs**, et ne code pas ce qui en dépend en supposant la réponse.
Si tu as toi-même besoin d'un arbitrage, pose-le avec \`scripts/demander.sh\` —
**plus jamais un artefact**, qui vit hors du dépôt et se perd.

\`IL DOIT DECIDER\` = il choisit. \`IL DOIT LE FAIRE\` = c'est une action de son
côté (déposer une clé, installer l'APK) ; « ou il en est » dit fait / pas
encore / ça bloque.

${attentes:-(non chargé)}

## Ce que Raphaël a répondu (ses 12 dernières réponses)
Ses mots, tels qu'il les a écrits dans le cockpit. **Traite-les comme
acquis** : une question déjà tranchée qu'on repose est ce qui l'épuise le plus.

${reponses:-(non chargé)}

## Ce que Jarvis rate en boucle, sans que personne s'en occupe
Des échecs que Jarvis a constatés LUI-MÊME (\`src/lib/retours.ts\`) : une action
qui a levé, une demande que Raphaël a dû redire dans la minute, ou un reproche
de sa part (« tu n'as pas lancé la musique »). Ceux-là sont revenus au moins
deux fois, personne n'a écrit de correction et aucun chantier ne les couvre.

Le titre dit la FAMILLE d'action et sa cible, pas la phrase : c'est voulu, un
correctif doit couvrir le contexte entier et pas la formulation du jour. S'il y
en a un ici qui touche ton périmètre, ouvre le chantier et corrige — c'est du
travail qui n'attend après personne.

${echecs:-(non chargé)}

## Erreurs de Jarvis encore ouvertes (les 8 plus fréquentes)
Le registre du cockpit (table \`jarvis_erreurs\`) : ce qu'il a raté, regroupé par
empreinte. Une correction écrite ici est ce que Raphaël attend — traite-la comme
une consigne, et ouvre un chantier si elle demande du code.

${erreurs:-(non chargé)}

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
