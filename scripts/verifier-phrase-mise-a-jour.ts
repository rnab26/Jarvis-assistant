/**
 * Ce que Jarvis dit après une modification : la NOUVELLE valeur.
 *
 *   node --experimental-strip-types scripts/verifier-phrase-mise-a-jour.ts
 *
 * Aucun réseau. Chantier 8b8b6d36 : le 22 sept. 2026 à 22h22-22h24, SEPT
 * « modifie la tâche… » d'affilée. Chaque modification avait eu lieu ; la
 * confirmation disait le titre d'AVANT (« "Rappeler Ilan Régnier" mise à
 * jour »), il entendait l'ancien nom et recommençait. Les cas ci-dessous sont
 * ses vraies tâches de ce soir-là, relues dans journal_ecoute.
 */
import { phraseMiseAJourChantier, phraseMiseAJourTache } from "../src/lib/phraseMiseAJour.ts"

let echecs = 0
const verifier = (nom: string, ok: boolean, detail = "") => {
  if (!ok) echecs++
  console.log(`${ok ? "OK  " : "ÉCHEC"} ${nom}${ok ? "" : `\n      ${detail}`}`)
}

const cat = (id: string | null | undefined) => (id === "c-perso" ? "Perso" : undefined)
const ilan = { title: "Rappeler Ilan Régnier", status: "todo", category_id: "c-perso", due_date: null, due_time: null }

{
  const p = phraseMiseAJourTache(ilan, { title: "Appeler la compagnie El Al pour récupérer mes points" }, cat)
  verifier(
    "le cas du 22 sept. : la phrase dit le NOUVEAU titre",
    p.includes("renommée en \"Appeler la compagnie El Al pour récupérer mes points\""),
    p,
  )
  verifier("…et nomme la tâche telle qu'il la connaissait, pour qu'il la retrouve", p.startsWith("\"Rappeler Ilan Régnier\""), p)
  verifier("…jamais le « mise à jour » qui ne disait rien", !p.includes("mise à jour"), p)
}

{
  const avant = { ...ilan, title: "Appeler la compagnie El Al pour récupérer mes points" }
  const p = phraseMiseAJourTache(avant, { title: "Appeler la compagnie El Al pour récupérer mes points" }, cat)
  verifier(
    "rien n'a vraiment changé : il l'entend, au lieu d'un « mise à jour » trompeur",
    p.includes("était déjà comme ça"),
    p,
  )
}

{
  const p = phraseMiseAJourTache(ilan, { due_date: "2026-09-25", due_time: "10:00" }, cat)
  verifier("une échéance se dit en clair : jour et heure", /pour vendredi 25 septembre à 10 h/.test(p), p)
  const p2 = phraseMiseAJourTache(ilan, { category_id: "c-perso" }, cat)
  verifier("reranger dans la MÊME catégorie ne se présente pas comme un changement", p2.includes("était déjà comme ça"), p2)
  const p3 = phraseMiseAJourTache({ ...ilan, category_id: null }, { category_id: "c-perso" }, cat)
  verifier("une catégorie se dit par son nom", p3.includes("rangée dans Perso"), p3)
  const p4 = phraseMiseAJourTache(ilan, { status: "done" }, cat)
  verifier("« faite » reste dit comme avant", p4 === "\"Rappeler Ilan Régnier\" marquée comme faite.", p4)
  const p5 = phraseMiseAJourTache(ilan, { title: "Rappeler Ilan", due_time: "18:30" }, cat)
  verifier("deux changements à la fois se disent tous les deux", p5.includes("renommée en") && p5.includes("18 h 30"), p5)
}

{
  const avant = { title: "Pouvoir créer des notes", status: "todo", priority: "normal", theme: null }
  const p = phraseMiseAJourChantier(avant, { title: "Créer des notes à la voix", priority: "high" })
  verifier(
    "un chantier renommé : la nouvelle valeur aussi, avec la priorité",
    p.includes("renommé en \"Créer des notes à la voix\"") && p.includes("priorité haute"),
    p,
  )
  verifier(
    "un chantier sans vrai changement : dit comme tel",
    phraseMiseAJourChantier(avant, { priority: "normal" }).includes("était déjà comme ça"),
  )
}

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} contrôle(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
