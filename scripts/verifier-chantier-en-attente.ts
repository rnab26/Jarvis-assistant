/**
 * Vérifie la suggestion de section et de titre faite après la création d'un
 * chantier à la voix, sans réseau.
 *
 *   node --experimental-strip-types scripts/verifier-chantier-en-attente.ts
 *
 * DEUX CHANTIERS, UNE SEULE RÉPONSE (17 sept. 2026, chat, épuration du
 * cockpit) : « Proposer, je valide » — même règle que suggestionTheme.ts et
 * suggestionCategorie.ts, transposée à 9369ad72 (classement automatique) et
 * 1be8988d (titres).
 *
 * CE QUI PEUT ÊTRE FAUX EN SILENCE ICI :
 *
 * 1. LE SERVEUR CLASSE ENCORE EN SILENCE : la consigne doit dire explicitement
 *    de ne poser un thème que si l'utilisateur l'a nommé, comme category_id.
 * 2. UNE SUGGESTION QUI S'APPLIQUE SANS VALIDATION au lieu de se proposer.
 * 3. UN TITRE TRONQUÉ « RÉPARÉ » PAR UNE FAUSSE BONNE IDÉE : « Dans le
 *    cockpit pour que tout » n'a rien de récupérable localement — le module
 *    doit se TAIRE plutôt que proposer un fragment tout aussi incompréhensible.
 * 4. UNE RÉPONSE COURTE SANS RAPPORT PRISE POUR UNE VALIDATION.
 */
import { readFileSync } from "node:fs"
import {
  clauseSuggestionChantier,
  completionExpiree,
  FENETRE_COMPLETION_MS,
  reponseChantierEnAttente,
  type ChantierEnAttente,
} from "../src/lib/chantierEnAttente.ts"
import { suggererTitreChantier } from "../src/lib/titreChantier.ts"
import { interpreterLocalement } from "../src/lib/commandeLocale.ts"
import type { DevSection } from "@/types/database"

let echecs = 0
const verifier = (nom: string, ok: boolean, detail = "") => {
  if (!ok) echecs++
  console.log(`${ok ? "OK  " : "ÉCHEC"} ${nom}${ok ? "" : `\n      ${detail}`}`)
}

function section(id: string, nom: string): DevSection {
  return { id, user_id: "u", nom, description: null, position: 0, created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z" }
}

// ---------------------------------------------------------------------------
// suggererTitreChantier : les DEUX titres réels du 17 sept. 2026, mesurés sur
// ses vrais chantiers ouverts (select title from dev_items where
// archived_at is null and title ~* '^(dans |un |une |comme quoi)').
// ---------------------------------------------------------------------------

verifier(
  "« Comme quoi… » garde une phrase complète derrière : la proposition l'utilise",
  suggererTitreChantier("Comme quoi tous les bruits exterieurs derangent le micro") ===
    "Tous les bruits exterieurs derangent le micro",
)
verifier(
  "un titre TRONQUÉ, sans contenu récupérable derrière l'amorce : silence",
  suggererTitreChantier("Dans le cockpit pour que tout") === null,
  "« cockpit pour que tout » ne dirait pas plus que le titre d'origine — proposer un fragment tout aussi incompréhensible serait pire que se taire",
)
verifier(
  "un titre ordinaire, sans amorce connue : silence",
  suggererTitreChantier("Condenser le bloc mise à jour dans les paramètres") === null,
)
verifier(
  "amorce connue mais rien de consistant derrière : silence",
  suggererTitreChantier("Comme quoi") === null,
)
verifier("titre vide : silence", suggererTitreChantier("   ") === null)

// ---------------------------------------------------------------------------
// reponseChantierEnAttente : mêmes verdicts que reponseCategorie, sur des
// sections plutôt que des catégories.
// ---------------------------------------------------------------------------

const sections = [section("s1", "Voix et écoute"), section("s2", "L'app elle-même"), section("s3", "Le téléphone")]

verifier("« oui » accepte", reponseChantierEnAttente("oui", sections)?.verdict === "accepter")
verifier("« non » refuse", reponseChantierEnAttente("non", sections)?.verdict === "refuser")
verifier(
  "nommer une autre section la corrige",
  (() => {
    const r = reponseChantierEnAttente("plutôt dans le téléphone", sections)
    return r?.verdict === "corriger_section" && r.sectionNom === "Le téléphone"
  })(),
)
verifier(
  "une phrase qui CONTIENT le nom d'une section sans y répondre : rien",
  reponseChantierEnAttente("ajoute un chantier pour le téléphone", sections) === null,
  "sinon on rangerait un NOUVEAU chantier dans la mauvaise section au lieu de le créer",
)
verifier(
  "sa phrase parle bien de rangement mais le nom n'est pas dedans : illisible",
  reponseChantierEnAttente("non mets-le dans la sect", sections)?.verdict === "illisible",
)
verifier(
  "une commande ordinaire qui contient « dans » reste muette",
  reponseChantierEnAttente("mets la musique dans la voiture", sections) === null,
)

// ---------------------------------------------------------------------------
// La fenêtre de complétion — même durée, même garde-fou que les tâches.
// ---------------------------------------------------------------------------

const t0 = 1_000_000_000_000
const attente = (over: Partial<ChantierEnAttente> = {}): ChantierEnAttente => ({
  itemId: "c9",
  titre: "Le micro coupe",
  sectionSuggeree: null,
  titreSuggere: null,
  quand: t0,
  ...over,
})

verifier("rien en attente : expirée par construction", completionExpiree(null, t0))
verifier("dans la fenêtre : pas expirée", !completionExpiree(attente(), t0 + 60_000))
verifier("au-delà : expirée", completionExpiree(attente(), t0 + FENETRE_COMPLETION_MS + 1))

// ---------------------------------------------------------------------------
// La phrase dite — les DEUX suggestions se lisent dans le même message.
// ---------------------------------------------------------------------------

verifier(
  "les deux suggestions ensemble, une seule clause, qui attend « oui »",
  (() => {
    const clause = clauseSuggestionChantier({ sectionSuggeree: "Voix et écoute", titreSuggere: "Le micro coupe" })
    return /oui/.test(clause) && clause.includes("Voix et écoute") && clause.includes("Le micro coupe")
  })(),
)
verifier("rien à proposer : silence complet", clauseSuggestionChantier({ sectionSuggeree: null, titreSuggere: null }) === "")

// ---------------------------------------------------------------------------
// Reconnue sur l'appareil, et seulement quand quelque chose l'attend
// ---------------------------------------------------------------------------

const ctxSansAttente = {
  taches: [],
  chantiers: [],
  contacts: [],
  sections,
  chantierEnAttente: null,
} as unknown as Parameters<typeof interpreterLocalement>[1]

verifier(
  "sans rien en attente, « oui » ne déclenche rien ICI (part au serveur ou reste sans effet)",
  interpreterLocalement("oui", ctxSansAttente) === null,
)

const ctxAvecAttente = {
  ...ctxSansAttente,
  chantierEnAttente: attente({ sectionSuggeree: "Voix et écoute", titreSuggere: "Le micro coupe", quand: Date.now() - 1000 }),
} as unknown as Parameters<typeof interpreterLocalement>[1]

verifier(
  "« oui » complète le chantier en attente",
  (() => {
    const a = interpreterLocalement("oui", ctxAvecAttente)
    return (
      a?.length === 1 &&
      a[0].action === "complete_last_chantier" &&
      "verdict" in a[0] &&
      a[0].verdict.verdict === "accepter"
    )
  })(),
)
verifier(
  "une nouvelle demande de chantier n'est PAS prise pour une réponse",
  (() => {
    const a = interpreterLocalement("ajoute un chantier pour la sauvegarde du serveur", ctxAvecAttente)
    return a !== null && a[0].action === "add_dev_item"
  })(),
)
verifier(
  "sa phrase coupée fait redemander ICI, en nommant le chantier",
  (() => {
    const a = interpreterLocalement("non mets-le dans la sect", ctxAvecAttente)
    if (a?.length !== 1 || a[0].action !== "clarify") return false
    const message = "message" in a[0] ? String(a[0].message) : ""
    return message.includes("Le micro coupe") && a[0].action !== "complete_last_chantier"
  })(),
)

const ctxExpiree = {
  ...ctxSansAttente,
  chantierEnAttente: attente({ quand: Date.now() - FENETRE_COMPLETION_MS - 1 }),
} as unknown as Parameters<typeof interpreterLocalement>[1]

verifier("expirée, « oui » ne complète plus rien ICI", interpreterLocalement("oui", ctxExpiree) === null)

// ---------------------------------------------------------------------------
// Côté exécution (voiceActions.ts) : lecture du code, comme pour add_task.
// ---------------------------------------------------------------------------

const voiceActions = readFileSync("src/lib/voiceActions.ts", "utf8")
verifier(
  "add_dev_item ne calcule la suggestion de section QUE quand aucun thème n'est donné",
  /action\.theme\s*\n?\s*\?\s*null\s*\n?\s*:\s*suggererSection/.test(voiceActions),
)
verifier(
  "une correction de section ne touche pas le titre en silence",
  /verdict\.verdict === "accepter" && attente\.titreSuggere/.test(voiceActions),
  "le titre ne se renomme que sur un « oui » entier, jamais quand seule la section a été corrigée",
)
verifier(
  "un chantier hors ligne ne dit pas « ajouté » — même honnêteté que les tâches",
  /if \(!cree\) \{\s*\n\s*derniereChantierEnAttente = null\s*\n\s*return phraseHorsLigne\(action\.title\)/.test(voiceActions),
)

// ---------------------------------------------------------------------------
// Le serveur ne devine plus le thème en silence, et ne tronque plus le titre.
// ---------------------------------------------------------------------------

const consigneServeur = readFileSync("supabase/functions/voice-command/index.ts", "utf8")
verifier(
  "le serveur ne classe plus un chantier en silence",
  !consigneServeur.includes("classe le chantier dans un thème") &&
    /add_dev_item : UNIQUEMENT si l'utilisateur a nommé explicitement/.test(consigneServeur),
)
verifier(
  "le serveur sait qu'un titre de chantier ne doit jamais être coupé en cours de dictée",
  /jamais un fragment coupé au milieu de la dictée/.test(consigneServeur),
)

console.log("")
console.log(echecs === 0 ? "Tout est vert." : `${echecs} vérification(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
