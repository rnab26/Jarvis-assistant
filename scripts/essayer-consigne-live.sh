#!/usr/bin/env bash
# Essayer la consigne du mode LIVE contre le VRAI modèle Live de Google, AVANT
# de redéployer live-jeton — sans compte de test ni base.
#
#   scripts/essayer-consigne-live.sh reglages
#
# Le pendant Live de scripts/essayer-consigne.sh (né le même jour, 23 sept.
# 2026). La consigne est prise TELLE QU'ELLE EST SUR LE DISQUE : le code de
# live-jeton/index.ts jusqu'à `Deno.serve`, exécuté par Deno pour en sortir
# CONSIGNE_LIVE et l'outil — jamais recopiée. Puis Node ouvre de vraies
# sessions Live (jeton éphémère, clé GEMINI_API_KEY_TEST, jamais affichée) et
# joue les cas de scripts/consigne/live-<nom>.mjs en texte.
#
# Ce que ça NE couvre PAS : l'audio (la détection de fin de phrase, la voix),
# et le vrai contexte (tâches, souvenirs) — un contexte court de test le
# remplace. Ça dit si le modèle APPELLE l'outil, avec quoi, et ce qu'il dit.
set -euo pipefail
CAS="${1:?usage : scripts/essayer-consigne-live.sh <nom> (scripts/consigne/live-<nom>.mjs)}"
RACINE="$(cd "$(dirname "$0")/.." && pwd)"
[ -f "$RACINE/scripts/consigne/live-$CAS.mjs" ] || { echo "Pas de cas : scripts/consigne/live-$CAS.mjs"; exit 2; }
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
cp -r "$RACINE/supabase/functions/_shared" "$RACINE/supabase/functions/live-jeton" "$TRAVAIL/"
LIGNE="$(grep -n '^Deno.serve(' "$TRAVAIL/live-jeton/index.ts" | cut -d: -f1)"
head -n "$((LIGNE - 1))" "$TRAVAIL/live-jeton/index.ts" > "$TRAVAIL/live-jeton/extrait.ts"
echo 'console.log(JSON.stringify({ consigne: CONSIGNE_LIVE, outil: OUTIL_COMMANDE }))' >> "$TRAVAIL/live-jeton/extrait.ts"
[ -f /root/.ccr/ca-bundle.crt ] && export DENO_CERT=/root/.ccr/ca-bundle.crt
export DENO_DIR="$CACHE/deno-dir"
"$DENO" run -A --no-config --node-modules-dir=none "$TRAVAIL/live-jeton/extrait.ts" > "$TRAVAIL/consigne.json" 2>/dev/null

node "$RACINE/scripts/consigne/live-$CAS.mjs" "$TRAVAIL/consigne.json" 2>&1 | grep -v 'Ephemeral token support'
exit "${PIPESTATUS[0]}"
