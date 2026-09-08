/**
 * Vérifie la reconnaissance d'un lien à récupérer, sans réseau.
 *
 *   node --experimental-strip-types scripts/verifier-documents.ts
 *
 * CE QUI PEUT ÊTRE FAUX EN SILENCE ICI (chantier 13c39a9b) :
 *
 * 1. UN TEXTE PARTAGÉ QUI N'EST PAS QUE LE LIEN pris pour un lien à
 *    récupérer : « regarde, j'ai eu ça : https://exemple.com » enregistrerait
 *    un fichier vide de sens à la place du message que Raphaël voulait garder.
 * 2. LA PONCTUATION DE FIN DE PHRASE avalée dans l'adresse : « le lien est
 *    https://exemple.com/facture.pdf. » composerait une adresse invalide.
 * 3. LE NOM DE FICHIER qui ne dit rien : un « Document 202609071530.pdf »
 *    sans le site d'origine serait imbuvable une fois qu'il y en a dix.
 */
import {
  extensionPourType,
  nomDocumentDepuisLien,
  texteEstUnLien,
  urlDansLaPhrase,
} from "../src/lib/documentLien.ts"

let echecs = 0
const verifier = (nom: string, ok: boolean, detail = "") => {
  if (!ok) echecs++
  console.log(`${ok ? "OK  " : "ÉCHEC"} ${nom}${ok ? "" : `\n      ${detail}`}`)
}

console.log("— Trouver l'adresse dans ce qui est dit —")

verifier(
  "une adresse simple se retrouve",
  urlDansLaPhrase("va chercher https://exemple.com/facture.pdf") === "https://exemple.com/facture.pdf",
)
verifier(
  "la ponctuation de fin de phrase ne fait pas partie de l'adresse",
  urlDansLaPhrase("le document est là : https://exemple.com/facture.pdf.") ===
    "https://exemple.com/facture.pdf",
)
verifier(
  "rien à trouver, rien ne se devine",
  urlDansLaPhrase("récupère ce document") === null,
)

console.log("\n— Un texte partagé qui n'est QUE le lien —")

verifier(
  "un lien seul, éventuellement entouré d'espaces",
  texteEstUnLien("  https://exemple.com/facture.pdf  ") === "https://exemple.com/facture.pdf",
)
verifier(
  "un message qui CONTIENT un lien n'est pas QUE le lien",
  texteEstUnLien("regarde, j'ai eu ça : https://exemple.com/facture.pdf") === null,
  "sinon un message qu'il voulait garder tel quel serait remplacé par le document du lien",
)
verifier("un texte sans lien n'en est pas un", texteEstUnLien("Des restaurants à Netanya") === null)

console.log("\n— Le nom du document enregistré —")

verifier("un PDF porte l'extension .pdf", extensionPourType("application/pdf") === "pdf")
verifier("une image jpeg porte .jpg", extensionPourType("image/jpeg") === "jpg")
verifier("un type inconnu ne ment pas sur ce qu'il est", extensionPourType("text/html") === "bin")
verifier("un type absent ne plante pas", extensionPourType(null) === "bin")

const nom = nomDocumentDepuisLien(
  "https://www.station-essence.co.il/recu/1234",
  "application/pdf",
  new Date("2026-09-07T15:30:00"),
)
verifier(
  "le nom porte le site d'origine, pas juste un horodatage",
  nom.startsWith("station-essence.co.il") && nom.endsWith(".pdf"),
  nom,
)
verifier(
  "une adresse illisible ne fait pas planter le nommage",
  nomDocumentDepuisLien("pas une adresse", null, new Date()).endsWith(".bin"),
)

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} vérification(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
