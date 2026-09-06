// Relatif avec extension : vérifiable sous `node --experimental-strip-types`,
// qui ne connaît pas l'alias « @/ » de Vite.
import { chantierDeguise, type IndiceChantier } from "./tacheOuChantier.ts"

/**
 * Où va ce qu'il vient de dicter : une tâche perso, ou un chantier ?
 *
 * SA DEMANDE, mot pour mot, le 6 sept. 2026 : « Si jarvis a un doute ou
 * est-ce qu'il faut déposer une requête ou un chantier il faut qu'il donne
 * une supposition a raphael ou bien raphael lui indique lui meme ou la
 * placer. »
 *
 * DEUX MOITIÉS, ET IL FAUT LES DEUX. La supposition ANNONCÉE au moment de la
 * dictée, et la correction acceptée juste après. Ce qui existait déjà
 * (`tacheOuChantier.ts`, la carte de l'onglet Tâches) est du RATTRAPAGE :
 * ça répare après coup ce qui a mal atterri, parfois des jours plus tard —
 * une de ses demandes a dormi dans sa liste de courses, invisible de toutes
 * les sessions.
 *
 * ON ANNONCE, ON NE DEMANDE PAS. Sa règle du 5 sept. tient toujours :
 * « aucune limite dans le sens où il doit faire tout ce que je demande sans
 * limite ». Rien n'attend sa réponse — Jarvis range au mieux, le DIT en
 * nommant la destination, et la correction reste possible. Exactement le
 * compromis de `actionsTelephoneFenetre.ts` pour les actions qui sortent.
 *
 * UNE SEULE RÈGLE DE RECONNAISSANCE POUR TOUT LE PROJET : `chantierDeguise`,
 * mesurée sur ses vraies lignes (6 signalées, 6 justes, 0 à tort). En écrire
 * une seconde ici, c'est accepter qu'elles divergent un jour — et ce jour-là
 * l'onglet Tâches et la commande vocale ne diraient plus la même chose du
 * même titre.
 *
 * CE QUI N'EST VOLONTAIREMENT PAS FAIT : le sens inverse, un chantier dicté
 * qui serait en fait une course. Rien ne le mesure — les six amorces viennent
 * de vraies lignes, dans un seul sens —, et un détecteur inventé
 * déplacerait ses chantiers sans raison. La correction, elle, marche dans les
 * deux sens : c'est là que le cas inverse est traité, par lui.
 *
 * Module PUR. Vérifié par scripts/verifier-ou-va-cette-dictee.ts.
 */

export type Destination = "tache" | "chantier"

/**
 * Ce qu'il a dicté ressemble-t-il à une demande adressée aux sessions plutôt
 * qu'à une chose à faire lui-même ?
 *
 * Rend `null` dans l'immense majorité des cas, y compris pour tout ce qui
 * parle d'un chantier de maçonnerie — « appeler le chantier de la villa
 * Dan » est une vraie tâche, et c'est le cas qui compte le plus.
 */
export function suppositionDictee(titre: string, notes?: string | null): IndiceChantier | null {
  return chantierDeguise(titre, notes)
}

/**
 * Ce que Jarvis dit quand il a supposé.
 *
 * Il NOMME ce qui l'a fait pencher, et la façon de le corriger — sans quoi
 * la supposition est indiscernable d'une décision arbitraire. Et jamais au
 * passé avant que l'écriture ait abouti : l'appelant ne compose cette phrase
 * qu'une fois la création faite.
 */
export function phraseSupposition(titre: string, indice: string): string {
  return `Je l'ai mis en chantier plutôt qu'en tâche, à cause de ${indice} : « ${titre} ». Dis-moi « non, mets-le en tâche » si je me trompe.`
}

/**
 * Combien de temps une correction peut encore viser ce qui vient d'être créé.
 *
 * Cinq minutes : le temps de l'entendre, d'y repenser et de le reprendre.
 * Au-delà, « non, mets-le en chantier » parle presque sûrement d'autre chose,
 * et déplacer la mauvaise ligne serait pire que ne rien faire.
 */
export const FENETRE_CORRECTION_MS = 5 * 60 * 1000

/** Ce qui vient d'être créé, et qu'une correction peut encore déplacer. */
export interface DerniereCreation {
  vers: Destination
  titre: string
  /** Millisecondes epoch. */
  quand: number
}

function aplatir(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/** Les mots qui n'ajoutent rien à une correction. Retirés d'abord, pour que
 * « non attends mets-le plutôt en chantier s'il te plait » se reconnaisse
 * comme « mets-le en chantier ». */
const REMPLISSAGE =
  /\b(?:non|attends|attend|en fait|enfin|plutot|finalement|s il te plait|stp|jarvis|pardon|excuse moi|euh|alors|bon|ah)\b/g

const VERS_CHANTIER = /\b(?:chantier|cockpit|developpement|dev)\b/
const VERS_TACHE = /\btaches?\b/

/**
 * Cette phrase est-elle une correction de destination, et rien d'autre ?
 *
 * LE POINT QUI COMPTE EST CE QU'ELLE REFUSE. « Ajoute un chantier pour
 * refaire la salle de bain » contient les mêmes mots et n'est PAS une
 * correction : c'est une nouvelle demande, et la prendre pour une correction
 * déplacerait la ligne précédente au lieu de créer celle-ci. On n'accepte
 * donc qu'une phrase COURTE et entièrement consommée par la tournure de
 * correction — pas un motif trouvé au milieu d'autre chose.
 */
export function correctionDeDestination(phrase: string): Destination | null {
  const nu = aplatir(phrase).replace(REMPLISSAGE, " ").replace(/\s+/g, " ").trim()
  if (!nu) return null
  // Au-delà, il y a du contenu en plus : c'est une demande, pas une reprise.
  if (nu.split(" ").length > 7) return null

  const tournure =
    /^(?:mets?|met|mettre|remets?|range|classe|deplace|bascule|passe|c est|c etait|ce n est pas)\b/
  if (!tournure.test(nu)) return null

  // Ce qui reste après la tournure ne doit parler QUE de la destination :
  // « mets-le en chantier » oui, « mets-le en chantier pour demain » non.
  const reste = nu
    .replace(tournure, "")
    .replace(/\b(?:le|la|les|ca|cela|celui la|celle la|ce|cette|en|dans|un|une|du|de|d|a|au|aux|pas|plutot|liste|des)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()

  const versChantier = VERS_CHANTIER.test(nu)
  const versTache = VERS_TACHE.test(nu)
  // Les deux nommées ensemble (« c'est un chantier pas une tâche ») : c'est
  // le mot qui suit la négation qu'on écarte.
  if (versChantier && versTache) {
    const negChantier = /\b(?:pas|non)\s+(?:un |une |le |la )?(?:chantier|cockpit)\b/.test(nu)
    const negTache = /\b(?:pas|non)\s+(?:un |une |le |la )?tache/.test(nu)
    if (negChantier && !negTache) return "tache"
    if (negTache && !negChantier) return "chantier"
    return null
  }
  if (!versChantier && !versTache) return null

  // Et rien d'autre que la destination dans ce qui reste.
  const mots = reste.split(" ").filter(Boolean)
  const attendus = new Set(["chantier", "chantiers", "cockpit", "developpement", "dev", "tache", "taches"])
  if (mots.some((m) => !attendus.has(m))) return null

  return versChantier ? "chantier" : "tache"
}

/** Une correction ne vaut que pour ce qui vient d'être créé, et seulement si
 * ça change vraiment de place. */
export function correctionApplicable(
  derniere: DerniereCreation | null,
  vers: Destination,
  maintenant: number,
): boolean {
  if (!derniere) return false
  if (derniere.vers === vers) return false
  return maintenant - derniere.quand <= FENETRE_CORRECTION_MS && maintenant >= derniere.quand
}

/** Ce que Jarvis dit après avoir déplacé — au passé, parce que c'est
 * l'appelant qui l'appelle une fois l'écriture aboutie. */
export function phraseDeplacement(titre: string, vers: Destination): string {
  return vers === "chantier"
    ? `C'est corrigé : « ${titre} » est maintenant un chantier du cockpit, plus une tâche.`
    : `C'est corrigé : « ${titre} » est maintenant une tâche, plus un chantier.`
}

/** Et ce qu'il dit quand il ne retrouve pas la ligne à déplacer — sans
 * jamais laisser croire que c'est fait. */
export function phraseIntrouvable(titre: string): string {
  return `Je ne retrouve pas « ${titre} » pour le déplacer. Rien n'a bougé — tu peux le faire depuis l'écran.`
}
