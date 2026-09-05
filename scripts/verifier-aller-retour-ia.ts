/**
 * Vérifie l'aller-retour avec une IA installée sur le téléphone.
 *
 *   node --experimental-strip-types scripts/verifier-aller-retour-ia.ts
 *
 * Aucun réseau, aucun téléphone : ce qui est vérifié ici, c'est la seule
 * chose qui puisse se tromper EN SILENCE — le rapprochement entre un texte
 * partagé et la question posée juste avant. Un mauvais rapprochement range la
 * réponse sous une question qui n'est pas la sienne, et personne ne le voit.
 *
 * Le reste de la chaîne (l'intent Android qui porte la question, le menu
 * « Partager » qui ramène le texte) est du natif déjà en place, et ne se
 * vérifie que sur l'appareil.
 */
import {
  corpsDuDocument,
  rapprocher,
  titreDepuisQuestion,
  FENETRE_MINUTES,
  type QuestionEnAttente,
} from "../src/lib/allerRetourIA.ts"

let echecs = 0
const verifier = (nom: string, ok: boolean, detail = "") => {
  if (!ok) echecs++
  console.log(`${ok ? "OK  " : "ÉCHEC"} ${nom}${ok ? "" : `\n      ${detail}`}`)
}

const T0 = new Date("2026-09-05T21:00:00")
const plusTard = (minutes: number) => new Date(T0.getTime() + minutes * 60000)

const QUESTION = "Des restaurants de viande réputés à Netanya"
const ATTENTE: QuestionEnAttente = {
  app: "Perplexity",
  question: QUESTION,
  envoyeeA: T0.toISOString(),
}

const REPONSE =
  "À Netanya, trois adresses reviennent souvent pour la viande : le Meat Bar sur " +
  "la promenade, Habasta dans le centre, et Carnivore près de la marina. Les trois " +
  "sont cachères et prennent les réservations le vendredi."

console.log("— La réponse revient attachée à sa question —")

{
  const r = rapprocher(REPONSE, ATTENTE, plusTard(3))
  verifier(
    "une vraie réponse partagée trois minutes après est rapprochée",
    r.type === "reponse" && r.app === "Perplexity" && r.question === QUESTION,
    JSON.stringify(r),
  )
  if (r.type === "reponse") {
    verifier(
      "son titre nomme l'application ET la question",
      r.titre.includes("Perplexity") && r.titre.includes("restaurants"),
      r.titre,
    )
    const corps = corpsDuDocument(r, plusTard(3))
    verifier(
      "le document garde la question, la réponse et la provenance",
      corps.includes(QUESTION) && corps.includes("Meat Bar") && corps.includes("Perplexity"),
      corps,
    )
  }
}

verifier(
  "une réponse partagée juste avant la limite passe encore",
  rapprocher(REPONSE, ATTENTE, plusTard(FENETRE_MINUTES - 1)).type === "reponse",
)

console.log("\n— Ce qui ne doit SURTOUT pas être pris pour une réponse —")

// Le plus coûteux des faux rapprochements : ranger un partage sans rapport
// sous une question posée le matin.
{
  const r = rapprocher(REPONSE, ATTENTE, plusTard(FENETRE_MINUTES + 1))
  verifier(
    "passé la fenêtre, c'est un partage ordinaire",
    r.type === "document" && r.pourquoi === "trop_tard",
    JSON.stringify(r),
  )
}

{
  const r = rapprocher(REPONSE, null, plusTard(1))
  verifier(
    "sans question en attente, rien n'est rapproché",
    r.type === "document" && r.pourquoi === "aucune_question",
    JSON.stringify(r),
  )
}

// Dans Perplexity, l'appui long sur SA PROPRE question la propose au partage
// avant que la réponse existe. La garder comme « réponse » donnerait un
// document qui répète la question deux fois.
{
  const r = rapprocher(
    "Des restaurants de viande réputés à Netanya, et lesquels sont ouverts le samedi",
    ATTENTE,
    plusTard(1),
  )
  verifier(
    "sa propre question repartagée n'est pas sa réponse",
    r.type === "document" && r.pourquoi === "c_est_la_question",
    JSON.stringify(r),
  )
}

{
  const r = rapprocher("https://perplexity.ai/search/abc", ATTENTE, plusTard(1))
  verifier(
    "une URL seule n'est pas une réponse",
    r.type === "document" && r.pourquoi === "trop_court",
    JSON.stringify(r),
  )
}

// Une horloge qui recule (changement d'heure, correction réseau) ne doit pas
// faire disparaître une question posée il y a une minute.
verifier(
  "une horloge qui recule ne périme pas la question",
  rapprocher(REPONSE, ATTENTE, plusTard(-2)).type === "reponse",
)

{
  const r = rapprocher(REPONSE, { ...ATTENTE, envoyeeA: "pas une date" }, plusTard(1))
  verifier(
    "une date illisible est refusée, pas devinée",
    r.type === "document" && r.pourquoi === "trop_tard",
    JSON.stringify(r),
  )
}

console.log("\n— Le titre reste lisible —")

verifier(
  "une question à rallonge est coupée, pas rendue telle quelle",
  titreDepuisQuestion("a".repeat(200), "ChatGPT").length < 80,
  titreDepuisQuestion("a".repeat(200), "ChatGPT"),
)
verifier(
  "une question courte n'est pas coupée",
  titreDepuisQuestion("Il fait quel temps demain", "Gemini") === "Gemini — Il fait quel temps demain",
)

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} vérification(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
