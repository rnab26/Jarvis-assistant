/**
 * Vérifie la durée de conservation du mot-à-mot des conversations.
 *
 *   node --experimental-strip-types scripts/verifier-retention.ts
 *
 * CE RÉGLAGE COMMANDE UNE SUPPRESSION, à chaque phrase, sans corbeille. C'est
 * la famille de bugs la plus chère du projet : personne ne remarque qu'une
 * purge efface trop, jusqu'au jour où on cherche une conversation d'août.
 *
 * Deux moitiés doivent dire exactement la même chose : le bouton de Paramètres
 * (`src/lib/memoirePrefs.ts`) écrit une valeur, et la fonction SQL
 * `retention_jours()` (migration 0023) la relit pour décider quoi effacer. Ce
 * contrôle lit LES DEUX et refuse qu'elles divergent — une valeur que l'app
 * peut écrire et que le SQL ne comprend pas vaudrait « sans limite » en
 * silence, et le réglage ne servirait plus à rien.
 */
import { readFileSync } from "node:fs"
import {
  RETENTIONS,
  RETENTION_KEY,
  RETENTION_PAR_DEFAUT,
  combienSeraientEffaces,
} from "../src/lib/memoirePrefs.ts"

let echecs = 0
const verifier = (nom: string, ok: boolean, detail = "") => {
  if (!ok) echecs++
  console.log(`${ok ? "OK  " : "ÉCHEC"} ${nom}${ok ? "" : `\n      ${detail}`}`)
}

const MIGRATION = readFileSync("supabase/migrations/0023_retention_echanges.sql", "utf8")

// ────────────────── Le défaut, et pourquoi il est ce qu'il est ──────────────────
{
  const defaut = RETENTIONS.find((r) => r.valeur === RETENTION_PAR_DEFAUT)
  verifier("le choix par défaut existe dans la liste", !!defaut)
  verifier(
    "et il n'efface RIEN",
    defaut?.jours === null,
    "supprimer est irréversible, garder ne l'est pas : un défaut qui efface ferait disparaître ses conversations d'août sans que personne s'en aperçoive",
  )
  verifier(
    "chaque durée dit ce qu'elle implique",
    RETENTIONS.every((r) => r.aide.trim().length > 20),
    "un choix qui efface définitivement ne se fait pas sur un intitulé de deux mots",
  )
  verifier(
    "aucune durée en double",
    new Set(RETENTIONS.map((r) => r.valeur)).size === RETENTIONS.length,
  )
}

// ───────── Les deux moitiés : ce que l'app écrit, ce que le SQL comprend ─────────
{
  verifier(
    "la migration lit bien la clé que l'app écrit",
    MIGRATION.includes(`'${RETENTION_KEY}'`),
    `${RETENTION_KEY} est introuvable dans 0023_retention_echanges.sql : le réglage n'aurait aucun effet`,
  )

  // La règle du SQL, recopiée telle quelle depuis la migration : un nombre de
  // 1 à 4 chiffres, entre 1 et 3650. La relire ici plutôt que la supposer,
  // c'est ce qui fait de ce contrôle autre chose qu'un vœu pieux.
  const regle = MIGRATION.match(/valeur ~ '\^\[0-9\]\{1,(\d+)\}\$' and valeur::int between (\d+) and (\d+)/)
  verifier(
    "la règle de lecture du SQL est bien celle qu'on croit",
    !!regle,
    "la migration a changé de forme : relis-la et mets ce contrôle à jour plutôt que de le supprimer",
  )
  if (regle) {
    const [, chiffres, min, max] = regle
    const compriseParLeSql = (v: string) =>
      new RegExp(`^[0-9]{1,${chiffres}}$`).test(v) &&
      Number(v) >= Number(min) &&
      Number(v) <= Number(max)

    for (const r of RETENTIONS) {
      if (r.jours === null) {
        verifier(
          `« ${r.libelle} » n'est PAS comprise comme un nombre de jours par le SQL`,
          !compriseParLeSql(r.valeur),
          `« ${r.valeur} » serait lue comme une durée, et effacerait`,
        )
      } else {
        verifier(
          `« ${r.libelle} » est comprise par le SQL, et vaut ${r.jours} jours`,
          compriseParLeSql(r.valeur) && Number(r.valeur) === r.jours,
          `l'app écrirait « ${r.valeur} » et le SQL comprendrait ${compriseParLeSql(r.valeur) ? Number(r.valeur) : "rien du tout"}`,
        )
      }
    }
  }

  verifier(
    "une valeur douteuse vaut « sans limite » côté SQL, jamais « tout effacer »",
    MIGRATION.includes("else null"),
    "le sens du doute doit aller vers CONSERVER : se tromper dans l'autre sens détruit",
  )
  verifier(
    "et sans réglage du tout, on ne supprime rien",
    /is not null/.test(MIGRATION),
    "un compte neuf, dont on ne connaît pas encore les préférences, ne doit rien perdre",
  )
}

// ────────────── Ce qu'on lui annonce avant d'effacer, et qui doit être vrai ──────────────
{
  const MAINTENANT = new Date("2026-09-05T12:00:00Z").getTime()
  const J = 24 * 3600_000
  const dates = [
    new Date(MAINTENANT - 1 * J).toISOString(),
    new Date(MAINTENANT - 10 * J).toISOString(),
    new Date(MAINTENANT - 40 * J).toISOString(),
    new Date(MAINTENANT - 200 * J).toISOString(),
  ]

  verifier("« sans limite » n'efface jamais rien", combienSeraientEffaces(dates, null, MAINTENANT) === 0)
  verifier("7 jours effacerait les trois plus anciennes", combienSeraientEffaces(dates, 7, MAINTENANT) === 3)
  verifier("30 jours en effacerait deux", combienSeraientEffaces(dates, 30, MAINTENANT) === 2)
  verifier("90 jours n'en effacerait qu'une", combienSeraientEffaces(dates, 90, MAINTENANT) === 1)
  verifier("sans aucune conversation, rien à annoncer", combienSeraientEffaces([], 7, MAINTENANT) === 0)
  verifier(
    "une date illisible n'est pas annoncée comme perdue",
    combienSeraientEffaces(["pas une date", ...dates], 7, MAINTENANT) === 3,
    "annoncer un chiffre trop haut ferait renoncer à un réglage qui ne détruit rien",
  )
}

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} vérification(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
