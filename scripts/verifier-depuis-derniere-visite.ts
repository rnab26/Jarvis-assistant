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

const message = (auteur: string, quand: string, corps = "coucou"): DevLogEntry => ({
  id: `m${++n}`,
  user_id: "u",
  item_id: null,
  author: auteur,
  kind: "info",
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
  message("claude/voix", APRES, "J'ai fini le micro."),
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
  "les messages des sessions sont comptés",
  bilan.messages.length === 1 && bilan.messages[0].body === "J'ai fini le micro.",
  JSON.stringify(bilan.messages.map((m) => m.body)),
)
verifier(
  "ce que Raphaël a écrit lui-même n'est pas du nouveau pour lui",
  !bilan.messages.some((m) => m.author === "Raphaël"),
)
verifier("et le bandeau s'affiche", bilan.quelqueChose)

// Sans repère (première ouverture) : on n'annonce RIEN, plutôt que tout.
const premiereFois = depuisDerniereVisite(ITEMS, MESSAGES, null)
verifier(
  "à la première ouverture, rien n'est annoncé",
  !premiereFois.quelqueChose && premiereFois.livres.length === 0,
  "tout le cockpit serait présenté comme nouveau",
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
