/**
 * Vérifie que l'annonce parlée pendant la fenêtre d'annulation n'est pas
 * relue une seconde fois par MicButton quand la réponse finale répète les
 * mêmes mots (« J'ouvre Waze. » à l'annonce, puis après l'ouverture).
 *
 *   node --experimental-strip-types scripts/verifier-annonce-dite.ts
 *
 * Chantier f44c6673, 6 sept. 2026.
 */
import { estDejaAnnoncee, marquerAnnonceParlee } from "../src/lib/annonceDejaDite.ts"

let echecs = 0
const verifier = (nom: string, ok: boolean, detail = "") => {
  if (!ok) echecs++
  console.log(`${ok ? "OK  " : "ÉCHEC"} ${nom}${ok ? "" : `\n      ${detail}`}`)
}

verifier(
  "une réponse identique à l'annonce n'est pas relue",
  (() => {
    marquerAnnonceParlee("J'ouvre Waze.")
    return estDejaAnnoncee("J'ouvre Waze.")
  })(),
)

verifier(
  "les espaces de tête/fin n'empêchent pas la reconnaissance",
  (() => {
    marquerAnnonceParlee("J'ouvre Waze.")
    return estDejaAnnoncee("  J'ouvre Waze.  ")
  })(),
)

verifier(
  "sans annonce préalable, rien n'est marqué comme déjà dit",
  !estDejaAnnoncee("J'ouvre Waze."),
)

verifier(
  "une réponse différente de l'annonce reste à dire",
  (() => {
    marquerAnnonceParlee("J'ouvre Waze.")
    return !estDejaAnnoncee("Je ne trouve pas d'application qui s'appelle \"Waze\" sur ton téléphone.")
  })(),
)

verifier(
  "ne sert qu'une fois : une deuxième vérification ne retrouve plus l'annonce",
  (() => {
    marquerAnnonceParlee("J'ouvre Waze.")
    estDejaAnnoncee("J'ouvre Waze.")
    return !estDejaAnnoncee("J'ouvre Waze.")
  })(),
  "une deuxième occurrence des mêmes mots, plus tard, est une coïncidence ordinaire — pas un doublon à taire",
)

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} échec(s).`)
process.exit(echecs === 0 ? 0 : 1)
