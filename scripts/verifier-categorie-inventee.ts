/**
 * Le serveur ne range JAMAIS une tâche dans une catégorie qu'il n'a pas
 * prononcée (chantier e945ae83, 28 sept. 2026), sans réseau.
 *
 *   node --experimental-strip-types scripts/verifier-categorie-inventee.ts
 *
 * La moitié de ces contrôles vérifie le SILENCE, et c'est la moitié qui compte.
 * Ce garde-fou s'interpose entre le modèle et ses tâches : s'il se déclenche à
 * tort, il EFFACE un rangement juste et pose une question inutile — pire que le
 * défaut qu'il corrige. L'asymétrie est écrite dans `nommeUneCategorie` et elle
 * commande tout : dans le doute, on laisse passer.
 */
import { readFileSync } from "node:fs"
import {
  nommeUneCategorie,
  questionCategorie,
  sansCategorieInventee,
} from "../supabase/functions/voice-command/categorieInventee.ts"

let echecs = 0
const verifier = (nom: string, ok: boolean, detail = "") => {
  if (!ok) echecs++
  console.log(`${ok ? "OK  " : "ÉCHEC"} ${nom}${ok ? "" : `\n      ${detail}`}`)
}

/** SES vraies catégories, les neuf lues dans sa base le 7 sept. 2026. */
const CATEGORIES = [
  { id: "cat-leads", name: "Leads" },
  { id: "cat-prelevements", name: "Prélèvements" },
  { id: "cat-hipouy", name: "Hipouy" },
  { id: "cat-serrurerie", name: "Serrurerie" },
  { id: "cat-admin", name: "Admin" },
  { id: "cat-perso", name: "Perso" },
  { id: "cat-achat", name: "Achat" },
  { id: "cat-notes", name: "Notes" },
  { id: "cat-melissa", name: "Melissa" },
]
const ATTENTE = { id: "t-marciano", titre: "Rappeler Dan Marciano", sans_date: false, categorie_a_valider: true }

// --- 1. A-t-il nommé une catégorie ? ---------------------------------------

// SES tournures, telles que la consigne du serveur les donne en exemple.
for (const [phrase, attendu] of [
  ["non mets-le dans la catégorie Leads", true],
  ["dans les leads", true],
  ["dans l'administratif", true],          // « Admin », dit autrement
  ["mets-le dans les prélèvements", true],
  ["plutôt dans Perso", true],
  ["range ça chez Mélissa", true],         // accent, et le nom seul
  ["mets ça dans mes achats", true],
  // LA PHRASE DU 15 SEPT., coupée par la reconnaissance vocale.
  ["non mets-le dans la catégor", false],
  ["non", false],
  ["attends non, pas là", false],
  ["", false],
] as const) {
  verifier(
    `« ${phrase} » ${attendu ? "nomme" : "ne nomme PAS"} une catégorie`,
    nommeUneCategorie(phrase, CATEGORIES) === attendu,
    `nommeUneCategorie a rendu ${nommeUneCategorie(phrase, CATEGORIES)}`,
  )
}
verifier(
  "sans catégorie connue, on ne prétend pas qu'il en a nommé une",
  nommeUneCategorie("dans les leads", []) === false,
)

// UN NOM MAL TRANSCRIT COMPTE QUAND MÊME, et c'est la seule chose que
// `DEBUT_SUFFISANT` apporte — trouvé en essayant le contrôle à l'envers : sans
// ce cas, monter la constante à 20 laissait tout vert, parce que les préfixes
// sont déjà reconnus dans les deux sens. Or sa dictée écorche les noms propres
// en permanence (« Mélissa » en quatre orthographes, mesuré le 23 sept.) : s'il
// nomme une catégorie et qu'on ne la reconnaît pas, on EFFACE un rangement juste.
for (const phrase of [
  "range ça dans melisa",        // Melissa, une lettre avalée
  "mets-le dans serrure",        // Serrurerie, dit court
  "dans les prelevemant",        // Prélèvements, écorché après le début
]) {
  verifier(
    `« ${phrase} » : un nom écorché nomme quand même sa catégorie`,
    nommeUneCategorie(phrase, CATEGORIES),
    "sinon un rangement JUSTE est effacé et il doit répondre pour rien",
  )
}

// --- 2. Ce que le garde-fou NE touche PAS ---------------------------------

const rangement = [{ action: "update_task", task_id: "t-marciano", changes: { category_id: "cat-leads" } }]

verifier(
  "aucune tâche n'attend sa catégorie : on ne touche à rien",
  sansCategorieInventee(rangement, { transcript: "range ça n'importe où", categories: CATEGORIES, tacheEnAttente: null })
    === rangement,
  "un rangement demandé en clair ne doit jamais être effacé",
)
verifier(
  "la tâche attend seulement sa DATE : rien à voir avec ce garde-fou",
  sansCategorieInventee(rangement, {
    transcript: "vendredi",
    categories: CATEGORIES,
    tacheEnAttente: { titre: "Rappeler Dan Marciano", sans_date: true },
  }) === rangement,
)
verifier(
  "il a NOMMÉ la catégorie : le rangement passe intact",
  sansCategorieInventee(rangement, { transcript: "non mets-le dans les leads", categories: CATEGORIES, tacheEnAttente: ATTENTE })
    === rangement,
  "c'est le cas mesuré comme JUSTE le 16 sept. : il range dans Leads, la bonne tâche",
)
const autreAction = [{ action: "add_task", title: "Acheter du pain", category_id: "cat-achat" }]
verifier(
  "une NOUVELLE demande n'est pas touchée, même pendant l'attente",
  sansCategorieInventee(autreAction, { transcript: "ajoute une tâche : acheter du pain", categories: CATEGORIES, tacheEnAttente: ATTENTE })
    === autreAction,
  "mesuré le 16 sept. : add_task, et la tâche en attente n'est pas touchée",
)
const sansCategorie = [{ action: "update_task", task_id: "t-marciano", changes: { due_date: "2026-10-01" } }]
verifier(
  "une modification qui ne range rien passe intacte",
  sansCategorieInventee(sansCategorie, { transcript: "plutôt le 1er octobre", categories: CATEGORIES, tacheEnAttente: ATTENTE })
    === sansCategorie,
)

// --- 3. Les DEUX modes d'échec mesurés le 27 sept. -------------------------

for (const [quoi, action] of [
  ["il vise une AUTRE tâche", { action: "update_task", task_id: "t-plombier", changes: { category_id: "cat-perso" } }],
  ["il vise un id INVENTÉ", { action: "update_task", task_id: "t-rappel-dan-marciano", changes: { category_id: "cat-leads" } }],
] as const) {
  const sortie = sansCategorieInventee([{ ...action }], {
    transcript: "non mets-le dans la catégor",
    categories: CATEGORIES,
    tacheEnAttente: ATTENTE,
  })
  verifier(
    `${quoi} : le rangement est retiré`,
    !sortie.some((a) => a.action === "update_task"),
    JSON.stringify(sortie),
  )
  verifier(
    `${quoi} : une question la remplace, et elle NOMME la tâche`,
    sortie.length === 1 &&
      sortie[0].action === "clarify" &&
      String(sortie[0].message).includes("Rappeler Dan Marciano"),
    JSON.stringify(sortie),
  )
}

// --- 4. Ce qu'il vient de dire d'utile n'est pas jeté avec ----------------

const dateEtCategorie = [
  { action: "update_task", task_id: "t-marciano", changes: { category_id: "cat-perso", due_date: "2026-10-01" } },
]
const gardee = sansCategorieInventee(dateEtCategorie, {
  transcript: "non, le 1er octobre, et dans la catégor",
  categories: CATEGORIES,
  tacheEnAttente: ATTENTE,
})
verifier(
  "la DATE qu'il vient de dire survit au retrait du rangement",
  gardee.some((a) => a.action === "update_task" && (a.changes as Record<string, unknown>).due_date === "2026-10-01"),
  JSON.stringify(gardee),
)
verifier(
  "et le rangement inventé, lui, a bien disparu",
  !gardee.some(
    (a) => a.action === "update_task" && (a.changes as Record<string, unknown>).category_id !== undefined,
  ),
  JSON.stringify(gardee),
)
verifier(
  "la question passe DEVANT la modification qui reste",
  gardee[0]?.action === "clarify",
  "une modification muette devant la question ne se remarquerait pas",
)

// --- 5. La question est MOT POUR MOT celle de l'appareil ------------------

// `commandeLocale.ts` dit déjà cette phrase pour le verdict `illisible` : deux
// formulations pour la même situation lui donneraient l'impression de parler à
// deux assistants. On compare les DEUX SOURCES, pas une paraphrase.
const local = readFileSync("src/lib/commandeLocale.ts", "utf8")
const attenduLocal = 'Dans quelle catégorie je range "${attente.titre}" ? (${noms})'
verifier(
  "l'appareil dit toujours cette phrase-là",
  local.includes(attenduLocal),
  `introuvable dans commandeLocale.ts : ${attenduLocal}`,
)
verifier(
  "et le serveur dit exactement la même",
  questionCategorie("Rappeler Dan Marciano", CATEGORIES) ===
    `Dans quelle catégorie je range "Rappeler Dan Marciano" ? (Leads, Prélèvements, Hipouy, Serrurerie, Admin, Perso, Achat, Notes, Melissa)`,
  questionCategorie("Rappeler Dan Marciano", CATEGORIES),
)
verifier(
  "sans catégorie à proposer, la question tient quand même",
  questionCategorie("Rappeler Dan Marciano", []) === `Dans quelle catégorie je range "Rappeler Dan Marciano" ?`,
  questionCategorie("Rappeler Dan Marciano", []),
)

// --- 6. Le garde-fou est vraiment branché --------------------------------

const serveur = readFileSync("supabase/functions/voice-command/index.ts", "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/\/\/[^\n]*/g, " ")
verifier(
  "index.ts l'applique pour de vrai",
  /sansCategorieInventee\(\s*\n?\s*sansListeAvantTransmission/.test(serveur),
  "un garde-fou écrit et jamais appelé laisse le défaut entier",
)
verifier(
  "et il reçoit la tâche en attente, sans quoi il ne peut rien décider",
  /\{\s*transcript,\s*categories,\s*tacheEnAttente\s*\}/.test(serveur),
)

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} échec(s).`)
process.exit(echecs === 0 ? 0 : 1)
