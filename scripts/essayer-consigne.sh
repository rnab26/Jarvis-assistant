#!/usr/bin/env bash
# Essayer la consigne de voice-command contre le VRAI modèle, AVANT de la
# déployer — et sans créer de compte de test ni toucher à la base.
#
#   scripts/essayer-consigne.sh memoire-de-travail [filtre]
#
# POURQUOI (23 sept. 2026) : le jeton de déploiement Supabase avait expiré,
# et une modification de consigne ne se vérifiait qu'une fois en ligne, par
# verifier-commande-vocale.mjs. Ce script prend la consigne telle qu'elle est
# SUR LE DISQUE (le code d'index.ts jusqu'à `Deno.serve`, sans rien recopier),
# l'appelle avec GEMINI_API_KEY_TEST — la clé du second projet Google, jamais
# le quota de Raphaël — et joue les cas de scripts/consigne/<nom>.ts.
#
# Ce que ça NE couvre PAS : ce que la fonction lit en base (souvenirs,
# corrections, ce qui l'attend…) et l'exécution sur le téléphone. Après un
# déploiement, verifier-commande-vocale.mjs reste LA vérification.
#
# Deno est pris dans le PATH, sinon installé une fois depuis npm dans le cache.
set -euo pipefail

CAS="${1:?usage : scripts/essayer-consigne.sh <nom du fichier de scripts/consigne/ sans .ts> [filtre]}"
FILTRE="${2:-}"
RACINE="$(cd "$(dirname "$0")/.." && pwd)"
[ -f "$RACINE/scripts/consigne/$CAS.ts" ] || { echo "Pas de cas : scripts/consigne/$CAS.ts"; exit 2; }
[ -n "${GEMINI_API_KEY_TEST:-}" ] || { echo "Il manque GEMINI_API_KEY_TEST dans l'environnement."; exit 2; }

CACHE="${XDG_CACHE_HOME:-$HOME/.cache}/jarvis-consigne"
mkdir -p "$CACHE"
DENO="$(command -v deno || true)"
if [ -z "$DENO" ]; then
  if [ ! -x "$CACHE/deno/node_modules/.bin/deno" ]; then
    echo "Installation de Deno (une fois) dans $CACHE…"
    mkdir -p "$CACHE/deno" && (cd "$CACHE/deno" && npm init -y >/dev/null && npm install --silent deno >/dev/null)
  fi
  DENO="$CACHE/deno/node_modules/.bin/deno"
fi

TRAVAIL="$(mktemp -d)"
trap 'rm -rf "$TRAVAIL"' EXIT
cp -r "$RACINE/supabase/functions/_shared" "$RACINE/supabase/functions/voice-command" "$TRAVAIL/"
LIGNE="$(grep -n '^Deno.serve(' "$TRAVAIL/voice-command/index.ts" | cut -d: -f1)"
head -n "$((LIGNE - 1))" "$TRAVAIL/voice-command/index.ts" > "$TRAVAIL/voice-command/consignes-extraites.ts"
echo 'export { ACTION_SCHEMA, VOICE_ACTION_TOOL, CONSIGNES, blocTacheEnAttente, normaliserAction }' \
  >> "$TRAVAIL/voice-command/consignes-extraites.ts"
cp "$RACINE/scripts/consigne/$CAS.ts" "$TRAVAIL/essai.ts"

# Le proxy de l'environnement cloud a sa propre autorité de certification.
[ -f /root/.ccr/ca-bundle.crt ] && export DENO_CERT=/root/.ccr/ca-bundle.crt
export DENO_DIR="$CACHE/deno-dir"
cd "$TRAVAIL"
"$DENO" run -A --no-config --node-modules-dir=none essai.ts $FILTRE 2>&1 | grep -v 'clé test\|Download'
exit "${PIPESTATUS[0]}"
