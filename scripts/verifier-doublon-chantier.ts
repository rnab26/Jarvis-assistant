/**
 * Vérifie l'avertissement « ça existe déjà » de la fenêtre d'envoi.
 *
 *   node --experimental-strip-types scripts/verifier-doublon-chantier.ts
 *
 * Aucun réseau. Les données ci-dessous sont de VRAIS chantiers du cockpit au
 * 4 sept. 2026, y compris deux vrais doublons que des sessions avaient dû
 * repérer à la main, après coup, en écrivant « [DOUBLON — traité par…] » dans
 * les notes.
 *
 * Les deux moitiés comptent autant l'une que l'autre :
 *   — retrouver la redite, et surtout le chantier DÉJÀ LIVRÉ qu'on redemande,
 *     puisque celui-là fait refaire à une session un travail qui existe ;
 *   — ne rien signaler quand il n'y a rien. Un avertissement qui se déclenche
 *     à tort une fois sur deux n'est plus lu du tout, et il aura fait perdre
 *     la seule chose qu'il devait faire gagner.
 */
import { chantiersProches } from "../src/lib/doublonChantier.ts"
import type { DevItem } from "../src/types/database.ts"

let echecs = 0
const verifier = (nom: string, ok: boolean, detail = "") => {
  if (!ok) echecs++
  console.log(`${ok ? "OK  " : "ÉCHEC"} ${nom}${ok ? "" : `\n      ${detail}`}`)
}

let n = 0
const chantier = (titre: string, archive = false, notes: string | null = null): DevItem => ({
  id: `c${++n}`,
  user_id: "u",
  title: titre,
  notes,
  status: "todo",
  priority: "normal",
  theme: null,
  archived_at: archive ? "2026-09-02T09:00:00Z" : null,
  claimed_by: null,
  claimed_at: null,
  claim_expires_at: null,
  created_at: "2026-09-01T10:00:00Z",
  updated_at: "2026-09-01T10:00:00Z",
})

/** De vrais titres de la base, ouverts et archivés. */
const CHANTIERS = [
  chantier('Réveil vocal "Jarvis" en arrière-plan (écran éteint)'),
  chantier('Réveil vocal "Jarvis" économe en batterie'),
  chantier('Réveil vocal "Jarvis" ne s\'active pas de façon fiable', true),
  chantier("Recherche web, avec une limite dure avant le premier centime"),
  chantier("Recherche web + lecture de liens et de PDF"),
  chantier("Bulle Jarvis flottante à l'écran, atteignable partout"),
  chantier("WhatsApp : rédiger, corriger et valider à la voix"),
  chantier("Le badge « nouvelle version » compare la mauvaise chose", true),
  chantier("Reçus et factures : les retrouver et les transmettre au contact"),
  chantier(
    "Les chantiers du cockpit ne sont pas rangés",
    true,
    "Livré : sections, filtre et résumé par section. Commit 6a92dc9.",
  ),
]

/** [ce qu'il dicte, le titre qui doit ressortir en tête] */
const DOIT_TROUVER: [string, string][] = [
  [
    "Le réveil vocal Jarvis ne marche pas quand l'écran est éteint",
    'Réveil vocal "Jarvis" en arrière-plan (écran éteint)',
  ],
  [
    "Il faudrait une recherche web avec une limite de dépense",
    "Recherche web, avec une limite dure avant le premier centime",
  ],
  [
    "Ajouter une bulle Jarvis flottante sur l'écran",
    "Bulle Jarvis flottante à l'écran, atteignable partout",
  ],
  [
    "Pouvoir valider un message WhatsApp à la voix avant qu'il parte",
    "WhatsApp : rédiger, corriger et valider à la voix",
  ],
]

for (const [texte, attendu] of DOIT_TROUVER) {
  const trouves = chantiersProches(texte, CHANTIERS)
  verifier(
    `« ${texte.slice(0, 44)}… » retrouve « ${attendu.slice(0, 34)}… »`,
    trouves[0]?.item.title === attendu,
    `obtenu : ${trouves.map((t) => `${t.score} ${t.item.title}`).join(" | ") || "rien"}`,
  )
}

// Le cas qui coûte le plus cher : redemander ce qui est DÉJÀ FAIT.
const dejaFait = chantiersProches(
  "Il faudrait ranger les chantiers du cockpit par section",
  CHANTIERS,
)
verifier(
  "un chantier déjà livré est signalé, et passe devant",
  dejaFait[0]?.item.archived_at !== null && dejaFait[0]?.item.archived_at !== undefined,
  `obtenu : ${dejaFait.map((t) => `${t.item.title} (${t.item.archived_at ? "livré" : "ouvert"})`).join(" | ") || "rien"}`,
)

// Et l'autre moitié : se taire.
const NE_DOIT_RIEN_TROUVER = [
  "Acheter du pain demain matin",
  "Rappelle-moi d'appeler le plombier",
  "Voir ça plus tard",
  "micro",
  "",
]
for (const texte of NE_DOIT_RIEN_TROUVER) {
  const trouves = chantiersProches(texte, CHANTIERS)
  verifier(
    `« ${texte || "(vide)"} » ne déclenche aucun avertissement`,
    trouves.length === 0,
    `a signalé : ${trouves.map((t) => `${t.score} ${t.item.title}`).join(" | ")}`,
  )
}

// Un mot courant partagé ne suffit pas : « Jarvis » est dans la moitié des
// titres, et un avertissement à chaque phrase ne serait plus lu.
const surUnSeulMot = chantiersProches("Jarvis devrait parler moins vite", CHANTIERS)
verifier(
  "un seul mot courant en commun ne déclenche rien",
  surUnSeulMot.length === 0,
  `a signalé : ${surUnSeulMot.map((t) => t.item.title).join(" | ")}`,
)

// La reprise mot pour mot d'un titre existant est le doublon le plus net.
const motPourMot = chantiersProches("Recherche web + lecture de liens et de PDF", CHANTIERS)
verifier(
  "un titre recopié à l'identique est signalé au maximum",
  motPourMot[0]?.score === 1 &&
    motPourMot[0]?.item.title === "Recherche web + lecture de liens et de PDF",
  JSON.stringify(motPourMot.map((t) => [t.score, t.item.title])),
)

// Au plus trois : une liste de dix ressemblances ne se lit pas sur un
// téléphone, et noierait la seule qui compte.
const beaucoup = chantiersProches("Réveil vocal Jarvis en arrière-plan écran éteint", CHANTIERS, 3)
verifier("au plus trois ressemblances affichées", beaucoup.length <= 3, `${beaucoup.length} rendues`)

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} vérification(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
