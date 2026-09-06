/**
 * Vérifie qu'on reconnaît une tâche perso qui est en fait un chantier.
 *
 *   node --experimental-strip-types scripts/verifier-tache-ou-chantier.ts
 *
 * Les six premiers cas sont copiés de ses VRAIES tâches, le 5 sept. 2026 —
 * dont une, « connexion entre mon Jarvis et celui de Mélissa », dormait dans
 * sa liste de courses depuis sa dictée, invisible de toutes les sessions.
 *
 * Mais ce qui compte le plus est la seconde moitié : ce qu'il NE FAUT PAS
 * signaler. Raphaël est dans l'immobilier — le mot « chantier » désigne chez
 * lui un chantier de maçonnerie neuf fois sur dix. Un signalement à tort sur
 * « appeler le chantier de la villa Dan » rendrait la ligne inutilisable.
 */
import { chantierDeguise } from "../src/lib/tacheOuChantier.ts"

let echecs = 0
const verifier = (nom: string, ok: boolean, detail = "") => {
  if (!ok) echecs++
  console.log(`${ok ? "OK  " : "ÉCHEC"} ${nom}${ok ? "" : `\n      ${detail}`}`)
}

console.log("— Ses vraies tâches, celles qui sont des chantiers déguisés —")

const VRAIES: [string, string | null, string][] = [
  ["R un chantier : savoir combien il reste de credit", null, "Savoir combien il reste de credit"],
  ["R un chantier sur la latence du mode live", null, "Sur la latence du mode live"],
  ["R un chantier pour claude code : automatiser la creation", null, "Automatiser la creation"],
  ["Un nouveau chantier : resultat du test", null, "Resultat du test"],
  [
    "R une nouvelle section de chantier qui s'appelle fonctionnalite",
    null,
    "Fonctionnalite",
  ],
  // Le titre ne porte que l'amorce : le sujet est dans la note, et il faut
  // lui retirer la même amorce — sinon le chantier s'appellerait comme la
  // tâche qu'on est en train de corriger.
  [
    "R un chantier de developpement non prioritaire :",
    "R un chantier de developpement non prioritaire : connexion entre mon jarvis et celui de melissa",
    "Connexion entre mon jarvis et celui de melissa",
  ],
]
for (const [titre, notes, attendu] of VRAIES) {
  const r = chantierDeguise(titre, notes)
  verifier(
    `« ${titre.slice(0, 46)}… » est reconnu`,
    r !== null,
    "cette demande resterait invisible de toutes les sessions",
  )
  verifier(
    `   et son titre de chantier est « ${attendu.slice(0, 40)}… »`,
    r?.titre === attendu,
    `obtenu « ${r?.titre} »`,
  )
}

console.log("\n— Ce qu'il ne faut SURTOUT pas signaler —")

// Raphaël travaille dans l'immobilier : « chantier » veut d'abord dire
// maçonnerie. Ces lignes sont de vraies tâches perso, ou en ont la forme.
const VRAIES_TACHES = [
  "Appeler le chantier de la villa Dan",
  "Commander les carreaux pour le chantier",
  "Passer sur le chantier demain matin",
  "Payer l'électricien du chantier Hipouy",
  "R dans mes taches perso d'acheter un spot",
  "Acheter des tétines",
  "Rappeler Jonathan",
  "Créer un robot pour les campagnes",
  "Lister les clients",
  "Relancer Michael pour le bilan",
]
for (const titre of VRAIES_TACHES) {
  verifier(
    `« ${titre} » reste une tâche`,
    chantierDeguise(titre, null) === null,
    `signalé à tort : ${JSON.stringify(chantierDeguise(titre, null))}`,
  )
}

console.log("\n— Les bords —")

verifier("un titre vide ne signale rien", chantierDeguise("", null) === null)
verifier("un titre d'espaces ne signale rien", chantierDeguise("   ", null) === null)
verifier(
  "une amorce SANS sujet ni note ne signale rien",
  chantierDeguise("Un chantier", null) === null,
  "on proposerait de créer un chantier sans titre",
)
verifier(
  "une amorce suivie de deux lettres ne signale rien",
  chantierDeguise("Un chantier : ok", null) === null,
  "« Ok » ne fait pas un titre de chantier",
)

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} vérification(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
