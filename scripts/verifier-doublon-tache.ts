/**
 * Vérifie qu'une tâche redite à la voix ne crée pas un second doublon
 * silencieux — le pendant de verifier-doublon-vocal.ts pour les tâches.
 *
 *   node --experimental-strip-types scripts/verifier-doublon-tache.ts
 *
 * LE CAS RÉEL, sur son journal du 15 sept. 2026 — pas une hypothèse. En
 * mode Live :
 *
 *   06:31:32  « Mets-moi un rappel par rapport à Jonathan Ducamp dans la
 *              partie perso » → add_task, sans date
 *   06:31:35  la même demande, 3 s plus tard → add_task À NOUVEAU, cette
 *              fois avec une échéance à 15h
 *
 * Deux tâches au titre identique, aucune n'en a averti. Il a corrigé
 * l'orthographe du nom sur l'une (update_task, silencieusement sans effet —
 * corrigé dans le même travail dans voiceActions.ts), puis demandé de
 * supprimer « Rappel Jonathan Ducamp » : delete_task a supprimé LA MAUVAISE
 * des deux, celle qui portait la bonne échéance. La tâque restée en base
 * n'a jamais eu de date.
 */
import { deciderDoublonTache } from "../src/lib/doublonChantierALaVoix.ts"
import type { Task } from "../src/types/database.ts"

let echecs = 0
const verifier = (nom: string, ok: boolean, detail = "") => {
  if (!ok) echecs++
  console.log(`${ok ? "OK  " : "ÉCHEC"} ${nom}${ok ? "" : `\n      ${detail}`}`)
}

let n = 0
const tache = (title: string, notes: string | null, status: "todo" | "done" = "todo"): Task => ({
  id: `id-${++n}`,
  user_id: "u",
  category_id: null,
  title,
  notes,
  due_date: null,
  due_time: null,
  status,
  created_at: "2026-09-15T06:31:32Z",
  updated_at: "2026-09-15T06:31:32Z",
})

// La première des deux tâches réellement créées à 3 s d'intervalle.
const PREMIERE = tache("Rappel Jonathan Ducamp", "Rapport au store de la résidence.")

const BASE = [
  PREMIERE,
  tache("Payer Jonathan store", "Rappeler Jonathan vers midi pour savoir s'il y a une réponse."),
  tache("Dans les taches administratives : passer chez jonathan", null),
]

// ── Le cas d'origine : la même demande, 3 secondes plus tard ──
const redite = deciderDoublonTache(
  "Rappel Jonathan Ducamp",
  "Rapport au store de la résidence.",
  BASE,
)
verifier(
  "la même tâche redite ne passe pas inaperçue",
  redite.verdict !== "creer",
  `verdict « ${redite.verdict} » — c'est exactement le bug du 15 sept. à 06 h 31`,
)
verifier(
  "et Jarvis nomme celle qui existe déjà",
  redite.verdict !== "creer" && redite.phrase.includes(PREMIERE.title),
  "sans le nom, impossible de savoir si c'est bien la sienne",
)

// ── Une demande NEUVE n'est jamais perdue ──
for (const [titre, note] of [
  ["Racheter un spot pour l'entrée", "Celui de gauche a grillé."],
  ["Appeler l'assurance pour le dégât des eaux", "Dossier numéro 4021."],
  ["Réserver le restaurant pour vendredi", "Chez Marco, 20h."],
] as const) {
  verifier(
    `« ${titre} » est créée sans discussion`,
    deciderDoublonTache(titre, note, BASE).verdict === "creer",
    "refuser une tâche neuve la perd, et rien ne le signalerait",
  )
}

// ── Une tâche déjà FAITE ne bloque pas : elle informe ──
const faite = [tache("Racheter un spot pour l'entrée", "Celui de gauche a grillé.", "done")]
const surFaite = deciderDoublonTache("Racheter un spot pour l'entrée", "Celui de gauche a grillé.", faite)
verifier(
  "redemander une tâche déjà faite la crée quand même",
  surFaite.verdict === "creer_en_avertissant",
  `verdict « ${surFaite.verdict} » — il a peut-être besoin d'un second spot`,
)
verifier(
  "mais Jarvis dit qu'elle est déjà faite",
  surFaite.verdict === "creer_en_avertissant" && /faite/.test(surFaite.phrase),
  surFaite.verdict === "creer_en_avertissant" ? surFaite.phrase : "(pas d'avertissement)",
)

// ── Une liste de tâches vide n'empêche rien ──
verifier(
  "sur une liste vide, tout se crée",
  deciderDoublonTache("Une tâche toute neuve", null, []).verdict === "creer",
)

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} vérification(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
