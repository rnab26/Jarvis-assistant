/**
 * Vérifie l'espacement minimal entre deux préchauffages de la connexion Live.
 *
 *   node --experimental-strip-types scripts/verifier-prechauffage.ts
 *
 * Chantier ba140853. `prechaufferConnexionLive()` (côté réseau) n'est pas
 * vérifiable ici : ce script couvre la seule décision, `doitPrechauffer()`.
 */
import { doitPrechauffer } from "../src/lib/live/prechauffage.ts"

let echecs = 0
const verifier = (nom: string, ok: boolean, detail = "") => {
  if (!ok) echecs++
  console.log(`${ok ? "OK  " : "ÉCHEC"} ${nom}${ok ? "" : `\n      ${detail}`}`)
}

verifier("jamais appelé (0) : on préchauffe", doitPrechauffer(0, 1_700_000_000_000))
verifier("juste après un appel : on attend", !doitPrechauffer(10000, 10500))
verifier("pile au délai minimal : on préchauffe", doitPrechauffer(10000, 30000))
verifier("bien après : on préchauffe", doitPrechauffer(10000, 60000))

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} vérification(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
