// Relatif avec extension : vérifiable sous `node --experimental-strip-types`,
// qui ne connaît pas l'alias « @/ » de Vite.
import { lireQuand, retirerMots, sansAccents } from "./dateOrale.ts"
import type { Category } from "@/types/database"

/**
 * Une tâche dictée sans date, ou sans catégorie : ce que Jarvis en dit, et ce
 * qu'il comprend quand la réponse arrive dans la foulée.
 *
 * SA DEMANDE, mot pour mot (chantier eeca8cca, 7 sept. 2026) : « mise a part
 * la date jarvis doit apprendre a me connaître il est programmé pour et il
 * doit aussi savoir définir dans quel contexte quel catégorie de tâche il
 * faut l'ajouter si je ne lui dit pas il doit me le suggérer a voix haute et
 * je lui valide ».
 *
 * DEUX RÈGLES DIFFÉRENTES, ET IL FAUT LES DEUX TELLES QUELLES :
 *
 * - La DATE manquante : on ANNONCE, on ne demande pas (règle du 5 sept.,
 *   déjà appliquée à ouVaCetteDictee.ts). Rien n'attend sa réponse ; s'il la
 *   donne dans la foulée, on complète.
 * - La CATÉGORIE supposée : lui, explicitement, veut une VALIDATION (« je
 *   lui valide ») — l'inverse de la règle générale, et c'est son choix pour
 *   ce cas précis. Rien n'est écrit tant qu'il n'a pas confirmé.
 *
 * Module PUR. Vérifié par scripts/verifier-tache-date-categorie.ts.
 */

export interface SuggestionEnAttente {
  categoryId: string
  categoryName: string
}

/** Ce qui vient d'être créé, et qu'une réponse dans la foulée peut compléter. */
export interface TacheEnAttente {
  taskId: string
  titre: string
  sansDate: boolean
  suggestion: SuggestionEnAttente | null
  /** Millisecondes epoch. */
  quand: number
}

/**
 * Combien de temps une réponse peut encore compléter la tâche qui vient
 * d'être créée. Même durée que la correction de destination
 * (ouVaCetteDictee.ts) : le temps de l'entendre et d'y répondre.
 */
export const FENETRE_COMPLETION_MS = 5 * 60 * 1000

export function completionExpiree(attente: TacheEnAttente | null, maintenant: number): boolean {
  return !attente || maintenant - attente.quand > FENETRE_COMPLETION_MS
}

/** La relance dite après « sans date », jamais une question. */
export function clauseSansDate(): string {
  return " Sans date : dis-moi pour quand si tu veux que je te le rappelle."
}

/** La suggestion de catégorie, qui EST une vraie question (sa demande). */
export function clauseSuggestionCategorie(categoryName: string): string {
  return ` Je pense la ranger dans "${categoryName}" — dis "oui", ou le nom d'une autre catégorie si je me trompe.`
}

function aplatir(texte: string): string {
  return sansAccents(texte).replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim()
}

/** Les mots qui n'ajoutent rien à une réponse de date. */
const FILLER_DATE =
  /\b(?:jarvis|s il te plait|stp|pardon|excuse moi|euh|alors|bon|dis moi|pour|ca|cela|donc|ok|d accord|tres bien|parfait|merci|le|la|de|du)\b/g

/**
 * Cette phrase répond-elle « pour quand ? », et rien d'autre ?
 *
 * MÊME PRINCIPE QUE correctionDeDestination (ouVaCetteDictee.ts) : on
 * n'accepte qu'une phrase entièrement consommée par la date. « demain je
 * pars en voyage, ajoute une tâche pour réserver l'hôtel » contient
 * « demain » et n'est PAS une réponse : c'est une nouvelle demande, et il ne
 * faut jamais dater la mauvaise tâche.
 */
export function reponseDate(
  phrase: string,
  maintenant = new Date(),
): { date: string; heure: string | null } | null {
  const { date, heure, motsRetires } = lireQuand(sansAccents(phrase), maintenant)
  if (!date) return null

  const reste = aplatir(retirerMots(sansAccents(phrase), motsRetires)).replace(FILLER_DATE, " ")
  const motsRestants = reste.split(/\s+/).filter(Boolean)
  // Une petite marge : « demain matin » laisse « matin » derrière lui (lireHeure
  // ne fixe pas d'heure sur ce seul mot), et c'est justement l'exemple de
  // Raphaël. Au-delà de deux mots, il y a du contenu en plus.
  if (motsRestants.length > 2) return null

  return { date, heure }
}

const ACCEPTER = /^(?:oui|ouais|exact|voila|c est ca|c est cela|correct|d accord|ok|vas y|top|parfait)$/
const REFUSER = /^non$/

export type ReponseCategorie =
  | { verdict: "accepter" }
  | { verdict: "refuser" }
  | { verdict: "corriger"; category: Category }
  | { verdict: "illisible" }

/**
 * Les mots qui disent « je te parle du RANGEMENT de cette tâche ».
 *
 * `categ` et non `categorie` : sa phrase du 15 sept. a été coupée par la
 * reconnaissance vocale sur « la catégor ». Un préfixe attrape la phrase
 * tronquée, qui est précisément le cas qu'on traite ici.
 *
 * C'EST CE MOTIF QUI TIENT LE SILENCE. Sans lui, « mets la musique dans la
 * voiture », dite dans les cinq minutes après une création de tâche, serait
 * prise pour une réponse de rangement.
 */
const PARLE_DE_RANGEMENT = /\b(?:categ|partie|section|liste)/

/**
 * Cette phrase valide-t-elle (ou corrige-t-elle) la catégorie suggérée ?
 *
 * `null` = ce n'est pas une réponse à la suggestion, c'est autre chose
 * (une nouvelle commande) — l'appelant doit alors oublier la suggestion et
 * traiter la phrase normalement, sans jamais deviner une catégorie sur une
 * phrase longue qui ne fait que CONTENIR son nom.
 */
export function reponseCategorie(phrase: string, categories: Category[]): ReponseCategorie | null {
  const nu = aplatir(phrase)
  if (!nu) return null
  if (ACCEPTER.test(nu)) return { verdict: "accepter" }
  if (REFUSER.test(nu)) return { verdict: "refuser" }
  // Une phrase longue est une nouvelle demande, pas une réponse courte.
  //
  // HUIT MOTS, ET C'EST MESURÉ SUR SA VRAIE DICTÉE. Le 15 sept. 2026 à
  // 17:32:57 il a répondu « non mets-le dans la catégorie Leads » — sept
  // mots. À six, cette phrase-là était refusée, elle partait au serveur, et
  // le serveur (qui ne sait pas qu'une tâche attend) a proposé de déplacer
  // « la tâche pour la banque Apoalim », créée sept heures plus tôt.
  //
  // Ce n'est PAS ce seuil qui protège contre une nouvelle demande prise pour
  // une réponse : c'est le « reste vide » ci-dessous. Une phrase qui dit
  // autre chose laisse forcément des mots derrière elle, quelle que soit sa
  // longueur. Le seuil n'est qu'une sortie rapide.
  if (nu.split(" ").length > 8) return null

  // Les mots qui n'ajoutent rien à une réponse de rangement. « partie » et
  // « section » y sont parce que c'est SON vocabulaire, relu dans ses vraies
  // dictées : « dans la partie perso », « dans la partie lead » — il dit
  // « partie » au moins aussi souvent que « catégorie ». Et « le » y manquait
  // alors que « la » y était : « mets-LE dans… » échouait là où « mets-LA
  // dans… » passait.
  const MOTS_INTRODUCTION =
    /\b(?:non|plutot|mets|mets la|mettre|range|range la|le|la|les|dans|en|plus|tot|categorie|partie|section|liste)\b/g
  for (const categorie of categories) {
    const nomNu = aplatir(categorie.name)
    if (!nomNu || !nu.includes(nomNu)) continue
    const reste = nu.replace(nomNu, "").replace(MOTS_INTRODUCTION, "").replace(/\s+/g, "").trim()
    if (reste.length === 0) return { verdict: "corriger", category: categorie }
  }

  // IL PARLE BIEN DU RANGEMENT, MAIS ON NE SAIT PAS DE QUELLE CATÉGORIE.
  //
  // Le 15 sept. à 17:32:57 : « non mets-le dans la catégor » — la phrase est
  // coupée, le nom n'est jamais arrivé. Rendre `null` ici renvoyait la phrase
  // au serveur, qui a d'abord visé une tâche vieille de sept heures ; et une
  // fois qu'il a su LAQUELLE (bloc `tacheEnAttente`), il l'a rangée dans la
  // catégorie suggérée — « Perso » — c'est-à-dire exactement celle que le
  // « non » refusait. Mesuré deux fois sur la fonction déployée, consigne
  // renforcée comprise : la prose ne suffit pas à l'en empêcher.
  //
  // C'est l'APPAREIL qui sait qu'il vient de refuser une suggestion, donc
  // c'est ici que ça se tranche — comme la confirmation d'un envoi. On ne
  // devine rien : on redemande, en nommant la tâche.
  if (PARLE_DE_RANGEMENT.test(nu)) return { verdict: "illisible" }
  return null
}
