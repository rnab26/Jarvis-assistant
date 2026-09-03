#!/usr/bin/env bash
# Déploie une Edge Function sans repasser par l'outil MCP.
#
#   scripts/deployer-fonction.sh voice-command
#
# POURQUOI CE SCRIPT EXISTE
#
# Le code poussé dans le dépôt ne se déploie pas tout seul : une Edge Function
# doit être renvoyée explicitement à Supabase. Le seul chemin disponible
# jusqu'ici était l'outil MCP deploy_edge_function, qui n'accepte le contenu
# des fichiers qu'EN CLAIR, recopié à la main dans l'appel. Pour
# voice-command, cela veut dire retranscrire 35 Ko de code écrit par d'autres
# sessions, à la virgule près, à chaque déploiement. Une seule erreur de
# recopie casse l'assistant en production, et la corriger demande de tout
# retranscrire une seconde fois.
#
# Ce script fait la même chose que sql.sh a fait pour le SQL : il passe par
# l'API HTTPS, en lisant les fichiers sur le disque. Plus rien à recopier,
# donc plus rien à casser par recopie.
#
# PRÉREQUIS : SUPABASE_ACCESS_TOKEN, un jeton personnel Supabase
# (https://supabase.com/dashboard/account/tokens), à enregistrer dans les
# variables d'environnement de l'environnement cloud — jamais dans le dépôt.
# Tant qu'il manque, le script le dit et s'arrête.

set -euo pipefail

FONCTION="${1:-voice-command}"
PROJET="${SUPABASE_PROJECT_REF:-bexiyvmdbxcwxasgslxp}"
DOSSIER="supabase/functions/$FONCTION"

if [ -z "${SUPABASE_ACCESS_TOKEN:-}" ]; then
  cat >&2 <<'MSG'
SUPABASE_ACCESS_TOKEN manquante : impossible de déployer depuis ici.

C'est un jeton personnel Supabase, à créer une seule fois sur
https://supabase.com/dashboard/account/tokens puis à ajouter aux variables
d'environnement de l'environnement Claude Code.

Sans lui, il faut repasser par l'outil MCP deploy_edge_function, qui impose
de recopier tout le code à la main dans l'appel.
MSG
  exit 2
fi

if [ ! -d "$DOSSIER" ]; then
  echo "Dossier introuvable : $DOSSIER" >&2
  exit 1
fi

# L'API attend un multipart : un manifeste JSON, puis chaque fichier.
metadata=$(python3 - "$DOSSIER" <<'PY'
import json, pathlib, sys
dossier = pathlib.Path(sys.argv[1])
fichiers = sorted(p.name for p in dossier.glob("*.ts"))
print(json.dumps({
    "name": dossier.name,
    "entrypoint_path": "index.ts",
    "verify_jwt": True,
    "static_patterns": [],
}))
PY
)

args=(-X POST
  "https://api.supabase.com/v1/projects/$PROJET/functions/deploy?slug=$FONCTION"
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN"
  -F "metadata=$metadata;type=application/json")

for fichier in "$DOSSIER"/*.ts; do
  args+=(-F "file=@$fichier;type=application/typescript")
done

reponse=$(curl -sS -w $'\n%{http_code}' "${args[@]}")
code=$(printf '%s' "$reponse" | tail -n1)
corps=$(printf '%s' "$reponse" | sed '$d')

if [ "$code" -ge 200 ] && [ "$code" -lt 300 ]; then
  version=$(printf '%s' "$corps" | python3 -c "import sys,json; print(json.load(sys.stdin).get('version','?'))" 2>/dev/null || echo "?")
  echo "$FONCTION déployée (version $version)."
  echo "Vérifie maintenant le comportement réel :"
  echo "  ANON_KEY=... node scripts/verifier-commande-vocale.mjs"
else
  echo "Échec du déploiement (HTTP $code) :" >&2
  printf '%s\n' "$corps" >&2
  exit 1
fi
