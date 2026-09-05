/**
 * Vérifie qu'une demande redite à la voix ne crée pas un second chantier.
 *
 *   node --experimental-strip-types scripts/verifier-doublon-vocal.ts
 *
 * LE CAS RÉEL, sur ses données du 5 sept. 2026 — pas une hypothèse :
 *
 *   18:29:04  « Dans les sections de chantier et les différents thèmes,
 *               créer des sous-sections… »
 *   18:30:44  « Diviser les thèmes de chantier avec des sous-sections
 *               maintenant »
 *
 * Deux chantiers au titre identique (b840b658 et 7b9d80a9). Il avait
 * reformulé en croyant que le premier n'avait pas pris. La saisie manuelle du
 * cockpit avertit depuis le 4 sept. ; à la voix, rien — alors que c'est à la
 * voix qu'il reformule, faute de voir le résultat.
 *
 * Les deux dangers sont symétriques, et ce contrôle garde les deux : ne pas
 * attraper la redite (le bug d'origine), et refuser une demande NEUVE parce
 * qu'elle partage trois mots courants avec une autre (bien pire : la demande
 * serait perdue sans que rien ne le dise).
 */
import { deciderDoublonVocal } from "../src/lib/doublonChantierALaVoix.ts"
import type { DevItem } from "../src/types/database.ts"

let echecs = 0
const verifier = (nom: string, ok: boolean, detail = "") => {
  if (!ok) echecs++
  console.log(`${ok ? "OK  " : "ÉCHEC"} ${nom}${ok ? "" : `\n      ${detail}`}`)
}

let n = 0
const item = (title: string, notes: string | null, archive = false): DevItem => ({
  id: `id-${++n}`,
  user_id: "u",
  title,
  notes,
  status: "todo",
  priority: "normal",
  theme: null,
  archived_at: archive ? "2026-09-04T10:00:00Z" : null,
  claimed_by: null,
  claimed_at: null,
  claim_expires_at: null,
  created_at: "2026-09-05T18:29:04Z",
  updated_at: "2026-09-05T18:29:04Z",
})

// Le chantier réellement créé à 18 h 29.
const PREMIER = item(
  "Sous-sections pour sessions multiples Claude Code",
  "Créer des sous-sections dans les thèmes existants pour permettre l'ouverture de plusieurs sessions Claude Code en parallèle et accélérer le développement.",
)

const BASE = [
  PREMIER,
  item("Lancer une musique précise n'a jamais marché", "Apple Music ne déclare pas l'intent."),
  item("Un seul écran d'autorisations au premier lancement", "Contacts, micro, position."),
]

// ── Le cas d'origine : la même demande, redite une minute plus tard ──
const redite = deciderDoublonVocal(
  "Sous-sections pour sessions multiples Claude Code",
  "Créer des sous-sections dans les thèmes existants pour permettre l'ouverture de plusieurs sessions Claude Code en parallèle.",
  BASE,
)
verifier(
  "la demande redite ne crée pas un second chantier",
  redite.verdict === "refuser",
  `verdict « ${redite.verdict} » — c'est exactement le bug du 5 sept. à 18 h 30`,
)
verifier(
  "et Jarvis nomme celui qui existe déjà",
  redite.verdict === "refuser" && redite.phrase.includes(PREMIER.title),
  "sans le nom, il ne peut pas savoir si c'est bien le sien",
)
verifier(
  "il dit aussi comment en créer un second s'il y tient",
  redite.verdict === "refuser" && /cockpit/.test(redite.phrase),
  "un refus sans issue de secours transforme un garde-fou en mur",
)

// ── Une demande NEUVE n'est jamais perdue ──
for (const [titre, note] of [
  ["Ajouter un mode hors ligne au cockpit", "Pouvoir lire les chantiers sans réseau."],
  ["Faire sonner un rappel une heure avant", "Notification en avance sur l'échéance."],
  ["Régler la couleur du cœur de Jarvis", "Depuis Paramètres, Apparence."],
] as const) {
  verifier(
    `« ${titre} » est créé sans discussion`,
    deciderDoublonVocal(titre, note, BASE).verdict === "creer",
    "refuser une demande neuve la perd, et rien ne le signalerait",
  )
}

// ── Un chantier DÉJÀ LIVRÉ ne bloque pas : il informe ──
const livre = [item("Le mot-clé de réveil Jarvis en arrière-plan", "Livré le 4 sept.", true)]
const surLivre = deciderDoublonVocal(
  "Le mot-clé de réveil Jarvis en arrière-plan",
  "Livré le 4 sept.",
  livre,
)
verifier(
  "redemander un chantier archivé le crée quand même",
  surLivre.verdict === "creer_en_avertissant",
  `verdict « ${surLivre.verdict} » — le redemander veut souvent dire qu'il a régressé`,
)
verifier(
  "mais Jarvis dit qu'il a déjà été livré",
  surLivre.verdict === "creer_en_avertissant" && /livré/.test(surLivre.phrase),
  surLivre.verdict === "creer_en_avertissant" ? surLivre.phrase : "(pas d'avertissement)",
)

// ── Un cockpit vide n'empêche rien ──
verifier(
  "sur un cockpit vide, tout se crée",
  deciderDoublonVocal("Un chantier tout neuf", null, []).verdict === "creer",
)

// ── Un titre de deux mots ne suffit pas à crier au doublon ──
const court = deciderDoublonVocal("Sous-sections", null, BASE)
verifier(
  "un titre trop court n'est JAMAIS refusé",
  court.verdict !== "refuser",
  `verdict « ${court.verdict} » — deux mots communs sur deux suffiraient à refuser n'importe quoi`,
)

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} vérification(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
