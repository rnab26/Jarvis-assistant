/**
 * Ce que l'écran dit pendant qu'il parle, et surtout ce qu'il ne dit pas.
 *
 *   node --experimental-strip-types scripts/verifier-attente-transcription.ts
 *
 * Sans réseau, sans navigateur : `src/lib/attenteTranscription.ts` est pur.
 *
 * LA MOITIÉ DE CES CONTRÔLES VÉRIFIE LE SILENCE. Le premier partiel d'Android
 * arrive parfois en 200 ms ; une phrase de réassurance qui clignoterait à
 * chaque prise de parole serait du bruit, et le bruit permanent finit par
 * cacher le jour où il dit autre chose. Elle ne doit apparaître QUE dans le
 * cas mesuré qui le gêne : micro ouvert, rien à l'écran, et l'attente
 * dépassée.
 */
import {
  ATTENTE_TRANSCRIPTION_MS,
  attenteActive,
  lireAttente,
  phraseEcoute,
  type EtatAttente,
} from "../src/lib/attenteTranscription.ts"

let echecs = 0
function verifier(nom: string, ok: boolean, detail = "") {
  if (!ok) echecs++
  console.log(`${ok ? "OK   " : "ÉCHEC"} ${nom}${ok ? "" : `\n      ${detail}`}`)
}

const ouvert: EtatAttente = { pret: true, aDuTexte: false, attenteDepassee: false }

// --- Ce qu'on dit, dans les trois situations réelles -----------------------

verifier(
  "micro pas encore ouvert : on dit qu'on le prépare",
  phraseEcoute({ ...ouvert, pret: false }).includes("prépare"),
  "sans ça, « Je t'écoute » serait affiché alors que start() n'a pas résolu",
)

verifier(
  "micro ouvert, rien encore à l'écran, attente dépassée : on le rassure",
  phraseEcoute({ ...ouvert, attenteDepassee: true }).includes("temps de retard"),
  "c'est LE cas du chantier : 1 à 3 s mesurées où il parle sans rien voir venir",
)

verifier(
  "et on lui dit de CONTINUER, jamais d'attendre",
  /continue/i.test(phraseEcoute({ ...ouvert, attenteDepassee: true })) &&
    !/patiente|attends/i.test(phraseEcoute({ ...ouvert, attenteDepassee: true })),
  "ses mots sont déjà captés (2826 ms de retard, phrase transcrite en entier) : lui dire d'attendre le ferait tout redire",
)

verifier(
  "du texte est arrivé : on revient à la phrase de toujours",
  phraseEcoute({ ...ouvert, aDuTexte: true, attenteDepassee: true }).includes("touche le cœur"),
  "la transcription défile, il n'y a plus rien à rassurer",
)

// --- Le silence, qui compte autant ----------------------------------------

verifier(
  "attente PAS dépassée : on ne dit rien de plus",
  phraseEcoute(ouvert).includes("touche le cœur") && !phraseEcoute(ouvert).includes("temps de retard"),
  "un partiel arrivé en 200 ms ferait clignoter la phrase pour rien",
)

verifier(
  "micro pas prêt : la réassurance ne prend jamais le dessus",
  phraseEcoute({ pret: false, aDuTexte: false, attenteDepassee: true }).includes("prépare"),
  "dire « je t'écoute » avant que le micro soit ouvert serait le mensonge qu'on corrige",
)

// --- Le réglage, et ce qu'une valeur cassée ne doit pas faire -------------

verifier(
  "réglage absent : on retombe sur le défaut mesuré",
  lireAttente(null) === ATTENTE_TRANSCRIPTION_MS,
  "un réglage jamais touché doit se comporter comme le défaut",
)

verifier(
  "réglage illisible : on retombe sur le défaut, JAMAIS sur zéro",
  lireAttente("bonjour") === ATTENTE_TRANSCRIPTION_MS && lireAttente("-5") === ATTENTE_TRANSCRIPTION_MS,
  "zéro éteindrait en silence ce qu'on vient de livrer, et personne ne le verrait",
)

verifier(
  "« Jamais » est une valeur voulue, pas une panne",
  lireAttente("0") === 0 && !attenteActive(0),
  "il doit pouvoir éteindre la phrase depuis Paramètres",
)

verifier(
  "un délai choisi est respecté tel quel",
  lireAttente("1500") === 1500 && attenteActive(1500),
  "sinon le contrôle de Paramètres ne servirait à rien",
)

// --- Le seuil, mesuré et pas choisi au jugé -------------------------------

verifier(
  "le défaut tombe sous le premier partiel le plus rapide mesuré",
  ATTENTE_TRANSCRIPTION_MS < 1135,
  "1135 ms est le plus court de ses deux tours réels : au-dessus, la phrase ne s'afficherait jamais quand il en a besoin",
)

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} contrôle(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
