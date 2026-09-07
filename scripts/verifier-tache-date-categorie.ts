/**
 * Vérifie la complétion d'une tâche créée sans date et/ou sans catégorie,
 * sans réseau.
 *
 *   node --experimental-strip-types scripts/verifier-tache-date-categorie.ts
 *
 * SA DEMANDE, mot pour mot (chantier eeca8cca, 7 sept. 2026, 13h40) :
 * « mise a part la date jarvis doit apprendre a me connaître il est
 * programmé pour et il doit aussi savoir définir dans quel contexte quel
 * catégorie de tâche il faut l'ajouter si je ne lui dit pas il doit me le
 * suggérer a voix haute et je lui valide. »
 *
 * CE QUI PEUT ÊTRE FAUX EN SILENCE ICI :
 *
 * 1. UNE PHRASE SANS RAPPORT PRISE POUR UNE RÉPONSE. « Demain je pars en
 *    voyage, ajoute une tâche pour réserver l'hôtel » contient « demain » et
 *    N'EST PAS une réponse à « pour quand ? » : la prendre pour telle
 *    daterait la MAUVAISE tâche (celle en attente) au lieu de créer la
 *    nouvelle. LA MOITIÉ DES CONTRÔLES CI-DESSOUS VÉRIFIE CE REFUS.
 * 2. UNE CATÉGORIE DEVINÉE DANS UNE PHRASE QUI N'Y RÉPOND PAS. « Ajoute une
 *    tâche pour repeindre la maison » contient le nom d'une catégorie
 *    « Maison » sans être une validation — la prendre pour telle rangerait
 *    la MAUVAISE tâche dans la mauvaise catégorie.
 * 3. UNE SUGGESTION QUI S'IMPOSE AU LIEU DE SE TAIRE : elle doit rester
 *    silencieuse quand rien ne se détache, comme suggestionTheme.ts.
 * 4. UNE COMPLÉTION QUI ARRIVE TROP TARD : au-delà de la fenêtre, elle parle
 *    presque sûrement d'autre chose.
 */
import { readFileSync } from "node:fs"
import {
  clauseSansDate,
  clauseSuggestionCategorie,
  completionExpiree,
  FENETRE_COMPLETION_MS,
  reponseCategorie,
  reponseDate,
  type TacheEnAttente,
} from "../src/lib/tacheDateEtCategorie.ts"
import { suggererCategorie } from "../src/lib/suggestionCategorie.ts"
import { interpreterLocalement } from "../src/lib/commandeLocale.ts"
import type { Category, Task } from "@/types/database"

let echecs = 0
const verifier = (nom: string, ok: boolean, detail = "") => {
  if (!ok) echecs++
  console.log(`${ok ? "OK  " : "ÉCHEC"} ${nom}${ok ? "" : `\n      ${detail}`}`)
}

function cat(id: string, name: string): Category {
  return { id, user_id: "u", name, created_at: "2026-09-01T00:00:00Z" }
}
function tache(id: string, title: string, category_id: string | null, notes: string | null = null): Task {
  return {
    id,
    user_id: "u",
    category_id,
    title,
    notes,
    due_date: null,
    due_time: null,
    status: "todo",
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
  }
}

// ---------------------------------------------------------------------------
// La suggestion de catégorie : elle se calcule, et elle se tait
// ---------------------------------------------------------------------------

const categories = [cat("c1", "Maison"), cat("c2", "Villa Dan"), cat("c3", "Perso")]
const taches = [
  tache("t1", "Racheter un spot pour l'entrée de la maison", "c1"),
  tache("t2", "Changer le joint de la douche", "c1"),
  tache("t3", "Commander les carreaux pour la villa Dan", "c2"),
  tache("t4", "Appeler le carreleur pour la villa Dan", "c2"),
  tache("t5", "Réserver le restaurant de samedi", "c3"),
]

verifier(
  "une tâche au vocabulaire proche d'une catégorie existante la suggère",
  suggererCategorie("Repeindre l'entrée de la maison", null, taches, categories)?.categoryId === "c1",
)
verifier(
  "et une autre, proche d'une catégorie différente, suggère celle-là",
  suggererCategorie("Commander le carrelage pour la villa Dan", null, taches, categories)?.categoryId === "c2",
)
verifier(
  "aucune catégorie : silence, pas une supposition au hasard",
  suggererCategorie("Racheter un spot pour l'entrée", null, [], []) === null,
)
verifier(
  "un vocabulaire sans rapport avec rien : silence",
  suggererCategorie("Renouveler le passeport", null, taches, categories) === null,
  "une suggestion fausse coûte plus cher qu'une absence de suggestion",
)

// ---------------------------------------------------------------------------
// La réponse à « pour quand ? » — et surtout ce qu'elle refuse
// ---------------------------------------------------------------------------

const maintenant = new Date("2026-09-07T10:00:00Z")

verifier(
  "« vendredi » seul répond",
  reponseDate("vendredi", maintenant)?.date === "2026-09-11",
)
verifier(
  "« demain matin » aussi — c'est l'exemple de Raphaël",
  reponseDate("demain matin", maintenant)?.date === "2026-09-08",
)
verifier(
  "« vendredi à 14h » porte la date ET l'heure",
  (() => {
    const r = reponseDate("vendredi à 14h", maintenant)
    return r?.date === "2026-09-11" && r?.heure === "14:00"
  })(),
)
verifier(
  "une phrase sans date reconnue ne répond pas",
  reponseDate("oui, vas-y", maintenant) === null,
)
verifier(
  "une phrase longue qui CONTIENT « demain » n'est PAS une réponse",
  reponseDate("demain je pars en voyage, ajoute une tâche pour réserver l'hôtel", maintenant) === null,
  "la prendre pour une réponse daterait la mauvaise tâche",
)

// ---------------------------------------------------------------------------
// La validation de la catégorie suggérée — une vraie question, sa demande
// ---------------------------------------------------------------------------

verifier(
  "« oui » accepte la suggestion",
  reponseCategorie("oui", categories)?.verdict === "accepter",
)
verifier(
  "« non » la refuse",
  reponseCategorie("non", categories)?.verdict === "refuser",
)
verifier(
  "nommer une autre catégorie la corrige",
  reponseCategorie("plutôt dans Perso", categories)?.verdict === "corriger" &&
    (reponseCategorie("plutôt dans Perso", categories) as { category: Category }).category.id === "c3",
)
verifier(
  "une phrase qui CONTIENT le nom d'une catégorie sans y répondre : rien",
  reponseCategorie("ajoute une tâche pour repeindre la maison", categories) === null,
  "sinon on rangerait une tâche sans rapport dans la mauvaise catégorie",
)
verifier(
  "sans catégorie connue, rien ne se force",
  reponseCategorie("oui", []) !== null && reponseCategorie("dans Perso", []) === null,
)

// ---------------------------------------------------------------------------
// La fenêtre de complétion
// ---------------------------------------------------------------------------

const t0 = 1_000_000_000_000
const attente = (sansDate: boolean, quand = t0): TacheEnAttente => ({
  taskId: "t9",
  titre: "Rappeler Jonathan",
  sansDate,
  suggestion: null,
  quand,
})

verifier("rien en attente : expirée par construction", completionExpiree(null, t0))
verifier("dans la fenêtre : pas expirée", !completionExpiree(attente(true), t0 + 60_000))
verifier(
  "au-delà : expirée",
  completionExpiree(attente(true), t0 + FENETRE_COMPLETION_MS + 1),
)

// ---------------------------------------------------------------------------
// Les phrases dites — jamais bloquantes pour la date, une vraie question
// pour la catégorie
// ---------------------------------------------------------------------------

verifier(
  "sans date : on annonce, on ne demande pas",
  !clauseSansDate().includes("?"),
)
verifier(
  "la suggestion de catégorie EST une question — sa demande explicite",
  clauseSuggestionCategorie("Maison").includes("?") === false &&
    /oui/.test(clauseSuggestionCategorie("Maison")),
  "elle attend « oui » ou un autre nom, sans forcément un point d'interrogation",
)

// ---------------------------------------------------------------------------
// Reconnue sur l'appareil, et seulement quand quelque chose l'attend
// ---------------------------------------------------------------------------

const ctxSansAttente = {
  taches: [],
  chantiers: [],
  contacts: [],
  categories,
  tacheEnAttente: null,
  maintenant,
} as unknown as Parameters<typeof interpreterLocalement>[1]

verifier(
  "sans rien en attente, « vendredi » seul ne déclenche rien ICI (part au serveur)",
  interpreterLocalement("vendredi", ctxSansAttente) === null,
)

const ctxAvecDate = {
  ...ctxSansAttente,
  tacheEnAttente: attente(true, maintenant.getTime() - 1000),
} as unknown as Parameters<typeof interpreterLocalement>[1]

verifier(
  "avec une tâche sans date en attente, « vendredi » la complète",
  (() => {
    const a = interpreterLocalement("vendredi", ctxAvecDate)
    return a?.length === 1 && a[0].action === "complete_last_task" && "due_date" in a[0] && a[0].due_date === "2026-09-11"
  })(),
)
verifier(
  "et une nouvelle demande de tâche n'est PAS prise pour une réponse",
  (() => {
    const a = interpreterLocalement("ajoute une tâche pour réserver l'hôtel", ctxAvecDate)
    return a !== null && a[0].action === "add_task"
  })(),
)

const ctxAvecSuggestion = {
  ...ctxSansAttente,
  tacheEnAttente: {
    taskId: "t9",
    titre: "Rappeler Jonathan",
    sansDate: false,
    suggestion: { categoryId: "c1", categoryName: "Maison" },
    quand: maintenant.getTime() - 1000,
  },
} as unknown as Parameters<typeof interpreterLocalement>[1]

verifier(
  "« oui » valide la catégorie suggérée",
  (() => {
    const a = interpreterLocalement("oui", ctxAvecSuggestion)
    return (
      a?.length === 1 &&
      a[0].action === "complete_last_task" &&
      "category_verdict" in a[0] &&
      a[0].category_verdict?.verdict === "accepter"
    )
  })(),
)

const ctxExpiree = {
  ...ctxSansAttente,
  tacheEnAttente: attente(true, maintenant.getTime() - FENETRE_COMPLETION_MS - 1),
} as unknown as Parameters<typeof interpreterLocalement>[1]

verifier(
  "expirée, « vendredi » ne complète plus rien ICI",
  interpreterLocalement("vendredi", ctxExpiree) === null,
)

// ---------------------------------------------------------------------------
// Côté exécution (voiceActions.ts) : la lecture du code, comme pour
// move_last_entry — ce fichier importe des modules « @/ » réels, non
// chargeables sous node.
// ---------------------------------------------------------------------------

const voiceActions = readFileSync("src/lib/voiceActions.ts", "utf8")
verifier(
  "add_task calcule la suggestion SEULEMENT quand aucune catégorie n'est donnée",
  /!action\.category_id\s*&&\s*resultat\?\.id\s*\n?\s*\?\s*suggererCategorie/.test(voiceActions),
)
verifier(
  "complete_last_task garde la catégorie en attente si la date seule vient d'être répondue",
  /derniereTacheEnAttente = attente\.suggestion \? \{ \.\.\.attente, sansDate: false \} : null/.test(voiceActions),
  "sinon accepter la date effacerait la question de catégorie sans qu'il ait répondu",
)
verifier(
  "et garde la date en attente si seule la catégorie vient d'être répondue",
  /derniereTacheEnAttente = attente\.sansDate \? \{ \.\.\.attente, suggestion: null \} : null/.test(voiceActions),
)
verifier(
  "une complétion expirée ne modifie rien",
  (() => {
    const bloc = voiceActions.slice(
      voiceActions.indexOf('case "complete_last_task"'),
      voiceActions.indexOf('case "complete_last_task"') + 400,
    )
    return /completionExpiree\(attente, Date\.now\(\)\)/.test(bloc) && /return "Je ne sais plus/.test(bloc)
  })(),
)

// ---------------------------------------------------------------------------
// Le serveur ne devine plus la catégorie en silence : c'est le téléphone qui
// suggère et attend une validation (une seule source de vérité).
// ---------------------------------------------------------------------------

const consigneServeur = readFileSync("supabase/functions/voice-command/index.ts", "utf8")
verifier(
  "le serveur ne pose plus une catégorie devinée sans la dire",
  !consigneServeur.includes("correspondant le mieux, ou null si aucune/pas de correspondance claire") &&
    /UNIQUEMENT si l'utilisateur l'a (?:dite|nommée) explicitement/.test(consigneServeur),
  "sinon deux mécanismes devineraient une catégorie chacun de leur côté, et divergeraient un jour",
)

console.log("")
console.log(echecs === 0 ? "Tout est vert." : `${echecs} vérification(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
