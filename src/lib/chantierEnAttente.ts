// Relatif avec extension : vérifiable sous `node --experimental-strip-types`,
// qui ne connaît pas l'alias « @/ » de Vite.
import { sansAccents } from "./dateOrale.ts"
import type { DevSection } from "@/types/database"

/**
 * Un chantier créé à la voix, sans section dite explicitement et/ou avec un
 * titre qui garde une amorce de dictée : ce que Jarvis en dit, et ce qu'il
 * comprend quand la réponse arrive dans la foulée.
 *
 * MÊME RÈGLE QUE tacheDateEtCategorie.ts, transposée aux chantiers. SA
 * DÉCISION, mot pour mot (17 sept. 2026, chat, épuration du cockpit) :
 * « Proposer, je valide » — répondue IDENTIQUEMENT aux deux chantiers
 * 9369ad72 (classement automatique) et 1be8988d (titres) : une suggestion se
 * PROPOSE et s'affiche, elle ne s'applique JAMAIS sans validation.
 *
 * Une seule attente à la fois, comme pour les tâches : les DEUX suggestions
 * (section et titre) se valident ENSEMBLE, d'un seul « oui » — les poser
 * comme deux questions séparées l'obligerait à répondre deux fois à la même
 * création, ce qui est exactement le défaut que la fenêtre de complétion des
 * tâches a réglé en regroupant date et catégorie.
 *
 * Module PUR. Vérifié par scripts/verifier-chantier-en-attente.ts.
 */

export interface ChantierEnAttente {
  itemId: string
  titre: string
  /** Le nom de section proposé, ou `null` si rien ne s'est détaché
   * (suggestionTheme.ts) ou qu'il l'a déjà dit explicitement. */
  sectionSuggeree: string | null
  /** Le titre plus lisible proposé, ou `null` si le titre écrit ne garde
   * aucune amorce connue (titreChantier.ts). */
  titreSuggere: string | null
  /** Millisecondes epoch. */
  quand: number
}

/** Même durée que la complétion d'une tâche (tacheDateEtCategorie.ts) et la
 * correction de destination (ouVaCetteDictee.ts) : le temps de l'entendre et
 * d'y répondre. */
export const FENETRE_COMPLETION_MS = 5 * 60 * 1000

export function completionExpiree(attente: ChantierEnAttente | null, maintenant: number): boolean {
  return !attente || maintenant - attente.quand > FENETRE_COMPLETION_MS
}

/** La proposition dite à voix haute après la création — c'est elle qui rend
 * la suggestion relisable avant d'être acceptée. */
export function clauseSuggestionChantier(attente: {
  sectionSuggeree: string | null
  titreSuggere: string | null
}): string {
  const parts: string[] = []
  if (attente.titreSuggere) parts.push(`l'appeler "${attente.titreSuggere}"`)
  if (attente.sectionSuggeree) parts.push(`le ranger dans "${attente.sectionSuggeree}"`)
  if (parts.length === 0) return ""
  return ` Je pense ${parts.join(" et ")} — dis "oui" pour valider, ou dis-moi ce qui ne va pas.`
}

function aplatir(texte: string): string {
  return sansAccents(texte).replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim()
}

const ACCEPTER = /^(?:oui|ouais|exact|voila|c est ca|c est cela|correct|d accord|ok|vas y|top|parfait)$/
const REFUSER = /^non$/

/** Les mots qui disent « je te parle du RANGEMENT de ce chantier » — même
 * motif que PARLE_DE_RANGEMENT dans tacheDateEtCategorie.ts. `sect` et
 * `categ` sont des PRÉFIXES exprès, pour attraper une phrase coupée en plein
 * mot (« dans la sect… »), comme « la catégor » pour les tâches. */
const PARLE_DE_RANGEMENT = /\b(?:categ|partie|sect|theme|liste)/

export type ReponseChantierEnAttente =
  | { verdict: "accepter" }
  | { verdict: "refuser" }
  | { verdict: "corriger_section"; sectionNom: string }
  | { verdict: "illisible" }

/**
 * Cette phrase valide-t-elle (ou corrige-t-elle) la suggestion en attente ?
 *
 * `null` = ce n'est pas une réponse à la suggestion, c'est autre chose (une
 * nouvelle commande) — l'appelant doit alors oublier la suggestion et
 * traiter la phrase normalement.
 */
export function reponseChantierEnAttente(
  phrase: string,
  sections: DevSection[],
): ReponseChantierEnAttente | null {
  const nu = aplatir(phrase)
  if (!nu) return null
  if (ACCEPTER.test(nu)) return { verdict: "accepter" }
  if (REFUSER.test(nu)) return { verdict: "refuser" }

  // Une phrase longue est une nouvelle demande, pas une réponse courte —
  // même seuil, même raison que reponseCategorie.
  if (nu.split(" ").length > 8) return null

  const MOTS_INTRODUCTION =
    /\b(?:non|plutot|mets|mets la|mettre|range|range la|le|la|les|dans|en|plus|tot|categorie|theme|partie|section|liste)\b/g
  for (const section of sections) {
    const nomNu = aplatir(section.nom)
    if (!nomNu || !nu.includes(nomNu)) continue
    const reste = nu.replace(nomNu, "").replace(MOTS_INTRODUCTION, "").replace(/\s+/g, "").trim()
    if (reste.length === 0) return { verdict: "corriger_section", sectionNom: section.nom }
  }

  // Il parle bien du rangement, mais on ne sait pas duquel — même garde-fou
  // que reponseCategorie : ne jamais deviner, redemander en nommant le
  // chantier plutôt que de ranger au hasard.
  if (PARLE_DE_RANGEMENT.test(nu)) return { verdict: "illisible" }
  return null
}
