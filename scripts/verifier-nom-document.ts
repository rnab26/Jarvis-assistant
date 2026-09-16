/**
 * IMPORTER UN DOCUMENT DONT LE NOM N'EST PAS DE L'ASCII.
 *
 *   node --experimental-strip-types scripts/verifier-nom-document.ts
 *
 * Aucun réseau. L'ALPHABET DE RÉFÉRENCE CI-DESSOUS EST MESURÉ, pas recopié
 * d'une documentation : un POST par caractère sur le vrai
 * `storage/v1/object/documents` de son projet, le 15 sept. 2026. C'est la
 * différence entre ce contrôle et celui qui aurait paraphrasé la règle qu'il
 * vérifie — le piège payé par le filtre des sessions autonomes le 6 sept.
 *
 * ET LE CAS CENTRAL EST LE SIEN, copié de sa capture au caractère près, pas
 * un nom hébreu inventé pour l'occasion.
 */
import { cleStockage, nomLisible, messageEchecImport } from "../src/lib/nomDocument.ts"

let echecs = 0
const verifier = (nom: string, ok: boolean, detail = "") => {
  if (!ok) echecs++
  console.log(`${ok ? "OK  " : "ÉCHEC"} ${nom}${ok ? "" : `\n      ${detail}`}`)
}

/** MESURÉ le 15 sept. 2026 contre le projet réel, caractère par caractère.
 * ACCEPTÉS : ! * ' & $ @ ; : + , ? = ( ) - . _ espace, et A-Z a-z 0-9.
 * REFUSÉS  : ~ ^ % " < > | \ ` { } # [ ]  — plus tout non-ASCII. */
const ACCEPTE_PAR_STORAGE = /^[A-Za-z0-9_!\-.*'() &$@;:+,?=]*$/

// ── Son cas, mot pour mot ────────────────────────────────────────────────────

/** Le nom exact de sa capture du 15 sept. 2026, celui qui a produit
 * « Invalid key: 8bb3be37-…/טופס 18 פופי יוגה 162437_260915_בעמ.pdf ». */
const LE_SIEN = "טופס 18 פופי יוגה 162437_260915_בעמ.pdf"

const cleSienne = cleStockage(LE_SIEN)
verifier(
  "le fichier de sa capture produit une clé que Storage accepte",
  ACCEPTE_PAR_STORAGE.test(cleSienne),
  `la clé porte encore des caractères refusés : ${cleSienne.slice(0, 80)}`,
)
verifier(
  "et il retrouve son nom, à l'identique",
  nomLisible(cleSienne) === LE_SIEN,
  `relu : ${nomLisible(cleSienne)}`,
)
verifier(
  "son extension survit — c'est elle qui décide si le téléphone sait l'ouvrir",
  cleSienne.endsWith(".pdf"),
  `clé : ${cleSienne.slice(-20)}`,
)

// ── L'hébreu n'était que la moitié visible ───────────────────────────────────

/** Mesurés refusés par Storage au même moment, et c'est le point : il vit
 * entre le français et l'hébreu, « reçu » et « été » sont des noms ordinaires
 * chez lui. Réduire ce module au support de l'hébreu raterait la moitié des
 * cas. */
for (const nom of ["facture été.pdf", "reçu.pdf", "à payer — janvier.pdf", "Contrat n°3.pdf"]) {
  const cle = cleStockage(nom)
  verifier(
    `« ${nom} » passe et se relit`,
    ACCEPTE_PAR_STORAGE.test(cle) && nomLisible(cle) === nom,
    `clé ${cle} → ${nomLisible(cle)}`,
  )
}

verifier(
  "un emoji dans le nom ne casse rien non plus",
  (() => {
    const nom = "photo 🏠 maison.jpg"
    const cle = cleStockage(nom)
    return ACCEPTE_PAR_STORAGE.test(cle) && nomLisible(cle) === nom
  })(),
  "les paires de substitution doivent se réécrire unité par unité",
)

// ── Ce qui ne doit PAS bouger ────────────────────────────────────────────────

/** Un nom déjà ASCII traverse INCHANGÉ : les documents d'avant ce correctif
 * gardent leur clé, il n'y a rien à migrer. Si ce contrôle tombe, toute la
 * bibliothèque existante devient introuvable. */
for (const nom of ["facture-2026.pdf", "notes (1).txt", "budget & co.xlsx", "a'b c!d.pdf"]) {
  verifier(
    `« ${nom} » n'est pas touché`,
    cleStockage(nom) === nom,
    `devenu ${cleStockage(nom)} — un document déjà stocké deviendrait introuvable`,
  )
}

verifier(
  "un « = » déjà présent dans un nom se relit tel quel après un aller-retour",
  (() => {
    const nom = "budget=2026.pdf"
    return nomLisible(cleStockage(nom)) === nom
  })(),
  "sans échapper `=` lui-même, « a=0041b » se relirait « aAb »",
)

/** Le cas de l'existant, à ne pas confondre avec le précédent : un document
 * stocké AVANT ce correctif pouvait porter un `=` nu dans sa clé. Le décodage
 * ne doit pas le mutiler. */
verifier(
  "une clé ancienne avec un « = » nu s'affiche sans être mutilée",
  nomLisible("budget=2026.pdf") === "budget=2026.pdf",
  "seul `=` suivi de quatre chiffres hexadécimaux se décode",
)

/** `/` est ACCEPTÉ par Storage (mesuré) mais c'est le séparateur de chemin :
 * un nom qui en contient créerait un sous-dossier, et le document
 * disparaîtrait de la liste — qui ne lit qu'un niveau. */
verifier(
  "une barre oblique dans le nom ne crée pas de sous-dossier",
  !cleStockage("12/03 relevé.pdf").includes("/"),
  `clé : ${cleStockage("12/03 relevé.pdf")}`,
)

verifier(
  "un nom vide reste vide — c'est à l'appelant de refuser, pas à ce module d'inventer",
  cleStockage("   ") === "",
  "inventer un nom ferait perdre le fichier dans la liste",
)

// ── Le budget de longueur ────────────────────────────────────────────────────

{
  const tresLong = `${"א".repeat(400)}.pdf`
  const cle = cleStockage(tresLong)
  verifier(
    "un nom démesuré est coupé, mais garde son extension",
    cle.length <= 900 && cle.endsWith(".pdf"),
    `longueur ${cle.length}, fin « ${cle.slice(-10)} »`,
  )
  verifier(
    "et il est coupé sur une frontière d'échappement, jamais au milieu",
    nomLisible(cle).endsWith(".pdf") && !nomLisible(cle).includes("="),
    `relu : ${nomLisible(cle).slice(-20)} — un « =05 » tronqué resterait affiché tel quel`,
  )
}

// ── Ce qu'il LIT quand ça échoue ─────────────────────────────────────────────

verifier(
  "« Invalid key » ne lui est jamais renvoyé tel quel",
  !messageEchecImport("Invalid key: 8bb3be37/טופס.pdf").toLowerCase().includes("invalid key"),
  "c'est exactement le message de sa capture : de l'anglais et un identifiant technique",
)
verifier(
  "et la phrase lui dit que ça vient de Jarvis, pas de son fichier",
  messageEchecImport("Invalid key: x").includes("Jarvis"),
  "sinon il renomme ses documents pour rien",
)
verifier(
  "une coupure réseau ne prétend pas savoir si le fichier est parti",
  (() => {
    const p = messageEchecImport("Failed to fetch")
    return p.includes("Regarde si le document est dans la liste") && !p.includes("n'est pas parti")
  })(),
  "du téléphone on ne PEUT pas savoir si Storage a reçu — même règle que le serveur vocal",
)
verifier(
  "un fichier trop lourd le dit en français",
  messageEchecImport("The object exceeded the maximum allowed size").includes("trop lourd"),
  "",
)
verifier(
  "un message inconnu est relayé, pas avalé",
  messageEchecImport("boom").includes("boom"),
  "avaler une cause inconnue rendrait la panne muette",
)

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} contrôle(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
