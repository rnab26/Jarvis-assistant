#!/usr/bin/env bash
# Poser une question à Raphaël — DANS SON APP, plus jamais dans un artefact.
#
# Usage :
#   scripts/demander.sh --question "On garde le mot-à-mot combien de temps ?" \
#     --pourquoi "Supprimer est irréversible, garder ne l'est pas." \
#     --chantier 5ca5c4a3-19c6-44f4-8846-b53f9e4d7ee1 \
#     --option "Sans limite|Rien n'est jamais supprimé.|recommande" \
#     --option "30 jours|Un mois glissant, puis on efface." \
#     --option "7 jours"
#
#   scripts/demander.sh --action --question "Dépose GOOGLE_GEOCODING_API_KEY dans les secrets Supabase" \
#     --pourquoi "Sans elle, les rappels de lieu ne peuvent pas géocoder une adresse."
#
# CE QUE ÇA REMPLACE, et pourquoi. Jusqu'au 5 sept. 2026, une session qui avait
# besoin d'un arbitrage publiait une fiche — une page hors du dépôt et hors de
# la base, dont l'URL devait être recopiée dans le CLAUDE.md sous peine d'être
# perdue. Ses mots ce soir-là : « les artefacts ont trop de durée de vie
# limitée et je te colle des réponses détaillées quand c'était nécessaire ».
# Deux fiches lui ont posé LA MÊME question le même soir, et il a répondu deux
# choses différentes.
#
# Ici, la question est une ligne de `dev_log`. Elle s'affiche en tête du
# cockpit (« Ce qui attend ta décision »), il y répond au pouce avec un
# commentaire et une photo, et sa réponse est injectée dans le contexte de
# CHAQUE session suivante par .claude/hooks/session-start.sh. Rien à recopier,
# rien à perdre.
#
# DEUX FAMILLES, à ne pas confondre (sa demande, répétée depuis la première
# fiche) : --question par défaut, il DÉCIDE ; --action, il FAIT quelque chose
# de son côté et dit où il en est (fait / pas encore / ça bloque).
#
# Avant de poser une question, relis les notes du chantier et le journal : une
# question à laquelle il a déjà répondu et qu'on repose est exactement ce qui
# l'a épuisé.

set -euo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

question=""
pourquoi=""
chantier=""
auteur="${JARVIS_SESSION:-$(git -C "$RACINE" rev-parse --abbrev-ref HEAD 2>/dev/null || echo inconnue)}"
kind="question"
options=()

while [ $# -gt 0 ]; do
  case "$1" in
    --question)  question="${2:-}"; shift 2 ;;
    --pourquoi)  pourquoi="${2:-}"; shift 2 ;;
    --chantier)  chantier="${2:-}"; shift 2 ;;
    --auteur)    auteur="${2:-}"; shift 2 ;;
    --option)    options+=("${2:-}"); shift 2 ;;
    --action)    kind="action"; shift ;;
    -h|--help)   sed -n '2,40p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "Argument inconnu : $1" >&2; exit 2 ;;
  esac
done

if [ -z "${question//[[:space:]]/}" ]; then
  echo "Erreur : --question est obligatoire." >&2
  exit 2
fi

# --pourquoi est OBLIGATOIRE, et ce n'est pas seulement une exigence de forme.
#
# Pour lui d'abord : sa consigne dit qu'une question doit dire « pourquoi tu la
# poses et ce que tu sais déjà ». Une question sans son pourquoi le force à
# rouvrir le chantier pour comprendre ce qu'on lui demande.
#
# Et pour le CODE ensuite, depuis le 7 sept. 2026 : `kind = "action"` porte
# deux sens opposés — une action qu'IL doit faire (ce script) et le compte
# rendu d'une action qu'une SESSION a faite. C'est `pourquoi` qui les sépare
# dans `src/lib/journalDestinataire.ts`, donc dans la carte « Ce qui attend ta
# décision », dans la colonne « pour toi », et dans ce qui fait sonner son
# téléphone. Tant qu'il était facultatif ici, cette séparation ne tenait que
# par habitude : une demande postée sans lui aurait disparu de son cockpit
# sans un bruit.
if [ -z "${pourquoi//[[:space:]]/}" ]; then
  echo "Erreur : --pourquoi est obligatoire — il dit pourquoi tu poses la question, et c'est aussi ce qui distingue une demande qui l'attend d'un compte rendu de session (voir src/lib/journalDestinataire.ts)." >&2
  exit 2
fi

# Une action ne se choisit pas, elle se fait : proposer des options y serait un
# contresens, et l'écran n'en afficherait aucune.
if [ "$kind" = "action" ] && [ ${#options[@]} -gt 0 ]; then
  echo "Erreur : --action et --option ne vont pas ensemble. Pour une action, il dit où il en est (fait / pas encore / ça bloque), il ne choisit pas." >&2
  exit 2
fi

# Python assemble le SQL : les libellés contiennent des apostrophes, des
# accents et parfois des guillemets, et une bataille d'échappement en Bash
# finirait par écrire une question tronquée sans que rien ne le dise.
sql="$(
  QUESTION="$question" POURQUOI="$pourquoi" CHANTIER="$chantier" AUTEUR="$auteur" KIND="$kind" \
  OPTIONS="$(printf '%s\n' ${options[@]+"${options[@]}"})" python3 - <<'PY'
import json, os, sys

def litteral(valeur):
    """Un littéral SQL sûr, quels que soient guillemets et sauts de ligne."""
    if valeur is None:
        return "null"
    return "$jarvis$" + valeur + "$jarvis$"

options = []
for ligne in os.environ["OPTIONS"].splitlines():
    if not ligne.strip():
        continue
    morceaux = ligne.split("|")
    libelle = morceaux[0].strip()
    if not libelle:
        continue
    aide = morceaux[1].strip() if len(morceaux) > 1 and morceaux[1].strip() else None
    recommande = len(morceaux) > 2 and morceaux[2].strip().lower().startswith("recommand")
    options.append({"cle": libelle, "libelle": libelle, "aide": aide, "recommande": recommande})

if any("$jarvis$" in (o["libelle"] + (o["aide"] or "")) for o in options):
    sys.exit("Une option contient le délimiteur $jarvis$ : renomme-la.")

question = os.environ["QUESTION"]
pourquoi = os.environ["POURQUOI"] or None
chantier = os.environ["CHANTIER"] or None
for texte in (question, pourquoi or "", os.environ["AUTEUR"]):
    if "$jarvis$" in texte:
        sys.exit("Le texte contient le délimiteur $jarvis$ : reformule.")

# Le user_id en sous-requête scalaire, JAMAIS un « limit 1 » sur le select
# entier : le piège du 3 sept. 2026, où six insertions n'en produisaient
# qu'une, sans la moindre erreur.
print(f"""insert into dev_log (user_id, item_id, author, kind, body, pourquoi, options)
values (
  (select user_id from dev_items limit 1),
  {litteral(chantier) if chantier else 'null'}{'::uuid' if chantier else ''},
  {litteral(os.environ["AUTEUR"])},
  {litteral(os.environ["KIND"])},
  {litteral(question)},
  {litteral(pourquoi) if pourquoi else 'null'},
  {litteral(json.dumps(options, ensure_ascii=False)) + '::jsonb' if options else 'null'}
);""")
PY
)"

printf '%s' "$sql" | "$RACINE/scripts/sql.sh" > /dev/null

# Relire dans un appel SÉPARÉ : `exec_sql` ne renvoie pas le nombre de lignes
# touchées, et un `returning` sur une insertion ne remonte rien. Sans cette
# relecture, une question jamais écrite passerait pour posée.
"$RACINE/scripts/sql.sh" "select id, kind, author, to_char(created_at, 'DD/MM HH24:MI') as pose_a, left(body, 80) as question from dev_log order by created_at desc limit 1"

cat <<'FIN'

La question est posée. Elle s'affiche en tête du cockpit de Raphaël (« Ce qui
attend ta décision ») et sera injectée au démarrage de chaque session tant
qu'il n'y a pas répondu — donc n'insiste pas ailleurs, et surtout ne la repose
pas dans une fiche.
FIN
