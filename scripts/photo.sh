#!/usr/bin/env bash
# Récupère une capture d'écran que Raphaël a jointe à une réponse.
#
# Usage :
#   scripts/photo.sh "<user_id>/reponses/<id>.jpg"          # écrit ./<id>.jpg
#   scripts/photo.sh "<user_id>/reponses/<id>.jpg" /tmp/x.jpg
#
# Le chemin se lit dans `dev_log.photo_chemin`, et le bloc injecté au démarrage
# de session le donne déjà pour chacune de ses réponses.
#
# POURQUOI CE SCRIPT EXISTE. Sans lui, la photo serait en écriture seule : il
# joindrait une capture, et aucune session ne pourrait la regarder. C'était
# déjà le défaut des fiches — il envoyait des captures dans la conversation
# faute de mieux, et elles disparaissaient avec elle.
#
# Le bucket « cockpit » est PRIVÉ. Ce script passe par la clé de service, qui
# ne quitte pas l'environnement cloud, exactement comme scripts/sql.sh.

set -euo pipefail

URL="${SUPABASE_URL:-https://bexiyvmdbxcwxasgslxp.supabase.co}"

if [ $# -lt 1 ]; then
  echo "Usage : scripts/photo.sh \"<user_id>/reponses/<id>.jpg\" [destination]" >&2
  exit 2
fi

chemin="$1"
destination="${2:-./$(basename "$chemin")}"

entetes=()
if [ -n "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
  entetes+=(-H "apikey: $SUPABASE_SERVICE_ROLE_KEY"
            -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY")
fi

# --fail : sans lui, une erreur JSON (« Object not found ») serait écrite dans
# le fichier de destination et passerait pour une image, jusqu'à ce qu'on
# essaie de l'ouvrir.
if ! curl -sS --fail --max-time 60 "${entetes[@]+"${entetes[@]}"}" \
    "$URL/storage/v1/object/cockpit/$chemin" -o "$destination"; then
  echo "Capture introuvable ou accès refusé : $chemin" >&2
  echo "Vérifie le chemin dans dev_log.photo_chemin, et que SUPABASE_SERVICE_ROLE_KEY est en place." >&2
  rm -f "$destination"
  exit 1
fi

echo "$destination"
