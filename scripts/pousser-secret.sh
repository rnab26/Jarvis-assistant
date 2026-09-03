#!/usr/bin/env bash
# Pousse une variable d'environnement de l'environnement cloud vers les
# secrets des Edge Functions Supabase, sans qu'elle transite par la
# conversation ni par le dépôt.
#
#   scripts/pousser-secret.sh GEMINI_API_KEY
#
# POURQUOI : une clé d'API ne doit apparaître ni dans le code, ni dans un
# commit, ni dans un message (règle de Raphaël). Le seul endroit où il la
# dépose est la liste des variables d'environnement de l'environnement
# Claude Code. Ce script la lit là et l'envoie à Supabase par l'API HTTPS ;
# rien n'est affiché, la valeur ne passe jamais dans une sortie.
#
# Un secret du même nom déjà présent est remplacé. Les fonctions déployées
# voient la nouvelle valeur à leur prochain démarrage.
#
# PRÉREQUIS : SUPABASE_ACCESS_TOKEN (voir deployer-fonction.sh).

set -euo pipefail

NOM="${1:-}"
PROJET="${SUPABASE_PROJECT_REF:-bexiyvmdbxcwxasgslxp}"

if [ -z "$NOM" ]; then
  echo "Usage : scripts/pousser-secret.sh NOM_DE_LA_VARIABLE" >&2
  exit 2
fi
case "$NOM" in SUPABASE_*)
  echo "Les secrets SUPABASE_* sont gérés par Supabase lui-même." >&2
  exit 2 ;;
esac
if [ -z "${SUPABASE_ACCESS_TOKEN:-}" ]; then
  echo "SUPABASE_ACCESS_TOKEN manquante : voir scripts/deployer-fonction.sh." >&2
  exit 2
fi
if [ -z "${!NOM:-}" ]; then
  cat >&2 <<MSG
$NOM est absente des variables d'environnement.

À faire par Raphaël, une seule fois : ajouter $NOM dans les variables
d'environnement de l'environnement Claude Code (claude.ai/code → réglages de
l'environnement), puis relancer ce script depuis une session neuve.
MSG
  exit 3
fi

# La valeur ne passe que par stdin de python, jamais en argument (visible
# dans ps) ni dans une sortie.
corps=$(python3 -c 'import json,os,sys; print(json.dumps([{"name": sys.argv[1], "value": os.environ[sys.argv[1]]}]))' "$NOM")

code=$(curl -sS -o /dev/null -w '%{http_code}' -X POST \
  "https://api.supabase.com/v1/projects/$PROJET/secrets" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  --data-binary "$corps")
unset corps

if [ "$code" = "201" ]; then
  echo "$NOM poussée dans les secrets Supabase (longueur ${#NOM} du nom seulement affichée, jamais la valeur)."
else
  echo "Échec (HTTP $code)." >&2
  exit 1
fi
