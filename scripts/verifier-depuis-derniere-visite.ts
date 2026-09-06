/**
 * Vérifie le bandeau « depuis ton dernier passage ».
 *
 *   node --experimental-strip-types scripts/verifier-depuis-derniere-visite.ts
 *
 * Aucun réseau. Ce qui est en jeu : Raphaël s'absente une nuit avec trois ou
 * quatre sessions au travail, et revient sur un cockpit qui a bougé. Ce
 * bandeau est la première chose qu'il lit. Deux façons de le rendre inutile,
 * qu'aucune erreur ne signalerait :
 *   — annoncer TOUT le cockpit comme nouveau (repère absent ou illisible), et
 *     il ne le lira plus jamais ;
 *   — compter ce qu'il a écrit lui-même comme « du nouveau », ce qui gonfle
 *     les chiffres avec ses propres messages.
 */
import { depuisDerniereVisite, depuisQuand } from "../src/lib/depuisDerniereVisite.ts"
import type { DevItem, DevLogEntry } from "../src/types/database.ts"

let echecs = 0
const verifier = (nom: string, ok: boolean, detail = "") => {
  if (!ok) echecs++
  console.log(`${ok ? "OK  " : "ÉCHEC"} ${nom}${ok ? "" : `\n      ${detail}`}`)
}

const HIER = "2026-09-03T20:00:00Z"
const AVANT = "2026-09-03T10:00:00Z"
const APRES = "2026-09-04T09:00:00Z"

let n = 0
const chantier = (titre: string, creele: string, archiveLe: string | null = null): DevItem => ({
  id: `c${++n}`,
  user_id: "u",
  title: titre,
  notes: null,
  status: archiveLe ? "done" : "todo",
  priority: "normal",
  theme: null,
  archived_at: archiveLe,
  claimed_by: null,
  claimed_at: null,
  claim_expires_at: null,
  created_at: creele,
  updated_at: creele,
})

const message = (
  auteur: string,
  quand: string,
  corps = "coucou",
  kind: DevLogEntry["kind"] = "info",
): DevLogEntry => ({
  id: `m${++n}`,
  user_id: "u",
  item_id: null,
  author: auteur,
  kind,
  body: corps,
  answered_at: null,
  created_at: quand,
})

const ITEMS = [
  chantier("Livré pendant son absence", AVANT, APRES),
  chantier("Livré avant son dernier passage", AVANT, AVANT),
  chantier("Ouvert pendant son absence", APRES),
  chantier("Ouvert avant, toujours là", AVANT),
]
const MESSAGES = [
  // Un compte rendu d'une session à l'autre : c'est le cas RÉEL du 6 sept.,
  // où deux notes de 2 000 et 2 500 caractères occupaient les deux lignes les
  // plus précieuses du bandeau.
  message("claude/voix", APRES, "J'ai fini le micro."),
  // Et une question qui lui est adressée, à lui : celle-là doit se lire.
  message("claude/voix", APRES, "Tu veux qu'on coupe après 30 s ?", "question"),
  message("claude/voix", AVANT, "Message d'avant."),
  message("Raphaël", APRES, "Ce qu'il a écrit lui-même."),
]

const bilan = depuisDerniereVisite(ITEMS, MESSAGES, HIER)

verifier(
  "les chantiers livrés pendant l'absence sont comptés",
  bilan.livres.length === 1 && bilan.livres[0].title === "Livré pendant son absence",
  JSON.stringify(bilan.livres.map((i) => i.title)),
)
verifier(
  "un chantier livré AVANT le dernier passage n'est pas recompté",
  !bilan.livres.some((i) => i.title === "Livré avant son dernier passage"),
)
verifier(
  "les chantiers ouverts pendant l'absence sont comptés",
  bilan.nouveaux.length === 1 && bilan.nouveaux[0].title === "Ouvert pendant son absence",
  JSON.stringify(bilan.nouveaux.map((i) => i.title)),
)
verifier(
  "un chantier livré n'est pas compté deux fois, en livré ET en nouveau",
  !bilan.nouveaux.some((i) => i.archived_at),
)
verifier(
  "ce qui lui est ADRESSÉ se lit dans le bandeau",
  bilan.messages.length === 1 && bilan.messages[0].body === "Tu veux qu'on coupe après 30 s ?",
  JSON.stringify(bilan.messages.map((m) => m.body)),
)
verifier(
  "et les notes entre sessions se comptent SANS se déballer",
  bilan.notesEntreSessions === 1,
  `${bilan.notesEntreSessions} — le 6 sept., deux comptes rendus de 2 000 et 2 500 caractères occupaient les deux lignes les plus précieuses du bandeau, le matin même où il a dit ne pas arriver à savoir ce qui avait bougé`,
)
verifier(
  "une note entre sessions compte quand même comme « il s'est passé quelque chose »",
  depuisDerniereVisite([], [message("claude/voix", APRES, "Compte rendu.")], HIER).quelqueChose,
  "le bandeau serait vide un jour où trois sessions ont travaillé toute la nuit",
)
verifier(
  "ce que Raphaël a écrit lui-même n'est pas du nouveau pour lui",
  !bilan.messages.some((m) => m.author === "Raphaël"),
)
verifier("et le bandeau s'affiche", bilan.quelqueChose)

// Sans repère sur cet écran — première ouverture, ou stockage effacé — son
// DERNIER MESSAGE dans le journal en est un, et un bon : il date d'un moment
// où il regardait le cockpit. Sans ce rattrapage, l'ouverture qui suit une
// absence, celle qui compte, n'annoncerait justement rien.
// Son message le plus récent fait foi — ici celui d'hier soir, le dernier
// moment où il regardait le cockpit.
const parLeMessage = depuisDerniereVisite(
  ITEMS,
  [
    ...MESSAGES.filter((m) => m.author !== "Raphaël"),
    message("Raphaël", HIER, "Sa consigne d'hier soir."),
    message("Raphaël", AVANT, "Un message plus ancien."),
  ],
  null,
)
verifier(
  "sans repère, son dernier message sert de point de départ",
  parLeMessage.quelqueChose &&
    parLeMessage.origine === "message" &&
    parLeMessage.livres.length === 1 &&
    parLeMessage.nouveaux.length === 1,
  JSON.stringify({
    origine: parLeMessage.origine,
    livres: parLeMessage.livres.length,
    nouveaux: parLeMessage.nouveaux.length,
  }),
)
verifier(
  "et c'est dit tel quel : « depuis ton dernier message », pas « passage »",
  parLeMessage.origine === "message" && parLeMessage.depuis === HIER,
  `${parLeMessage.origine} / ${parLeMessage.depuis}`,
)

// Ni repère, ni message de lui : là, on n'annonce vraiment rien.
const rienDuTout = depuisDerniereVisite(
  ITEMS,
  MESSAGES.filter((m) => m.author !== "Raphaël"),
  null,
)
verifier(
  "sans repère NI message de lui, rien n'est annoncé",
  !rienDuTout.quelqueChose,
  "tout le cockpit serait présenté comme nouveau",
)

// Ses messages sont signés de deux façons selon qu'il écrit depuis l'app ou
// qu'une session relaie ses mots. Les deux sont de lui.
const relaye = depuisDerniereVisite(
  ITEMS,
  [
    ...MESSAGES.filter((m) => m.author !== "Raphaël"),
    message("raphael (via claude/une-session)", HIER, "Sa consigne, relayée."),
  ],
  null,
)
verifier(
  "un message relayé « raphael (via … ) » est bien reconnu comme sien",
  relaye.origine === "message" && relaye.depuis === HIER && relaye.livres.length === 1,
  JSON.stringify({ origine: relaye.origine, depuis: relaye.depuis, livres: relaye.livres.length }),
)
verifier(
  "et il ne se compte pas lui-même comme un message reçu",
  !relaye.messages.some((m) => m.author.toLowerCase().startsWith("raphael")),
)

// Le repère de l'écran l'emporte : c'est le plus récent des deux.
const ecranDAbord = depuisDerniereVisite(
  ITEMS,
  [...MESSAGES, message("Raphaël", AVANT, "Vieux message.")],
  HIER,
)
verifier(
  "quand l'écran a son repère, c'est lui qui compte",
  ecranDAbord.origine === "passage" && ecranDAbord.depuis === HIER,
  `${ecranDAbord.origine} / ${ecranDAbord.depuis}`,
)

// Un repère illisible ne doit pas non plus tout faire passer pour nouveau.
const casse = depuisDerniereVisite(ITEMS, MESSAGES, "pas une date")
verifier(
  "un repère illisible n'annonce rien non plus",
  !casse.quelqueChose,
  "une date corrompue ferait tout ressortir",
)

// Rien n'a bougé : pas de bandeau du tout.
const rien = depuisDerniereVisite(ITEMS, MESSAGES, "2026-09-05T00:00:00Z")
verifier("quand rien n'a bougé, il n'y a pas de bandeau", !rien.quelqueChose)

// L'âge se dit en clair.
const ilYA = (h: number) => depuisQuand(new Date(Date.now() - h * 3600_000).toISOString())
verifier("« il y a 3 h »", ilYA(3) === "il y a 3 h", ilYA(3))
verifier("« hier » pour une nuit entière", ilYA(24) === "hier", ilYA(24))
verifier("« il y a 3 jours »", ilYA(72) === "il y a 3 jours", ilYA(72))
verifier("et des minutes pour un aller-retour", ilYA(0.2).endsWith("min"), ilYA(0.2))

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} vérification(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
