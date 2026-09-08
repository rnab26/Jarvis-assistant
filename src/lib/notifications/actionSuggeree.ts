// Import relatif avec extension, comme `veille.ts` : ce module doit tourner
// sous Node sans bundler (scripts/verifier-action-suggeree.ts).
import { cibleTropCourante } from "../chercherContact.ts"

/**
 * Quand un rappel sonne, Jarvis peut PROPOSER l'action, pas seulement sonner.
 *
 * Chantier 4363aecf, troisième volet de sa demande du 7 sept. 2026 : « la date
 * jarvis doit apprendre a me connaître [...] ou action de sa part ». Une tâche
 * « rappeler Jonathan » qui sonne à 14 h le laisse devant son téléphone avec
 * encore trois gestes à faire — ouvrir le répertoire, chercher, appuyer.
 *
 * PUR : aucun appel au répertoire, aucun React. Ce module ne fait qu'une
 * chose, extraire le NOM que la tâche désigne. C'est `chercherContact.ts` qui
 * décide ensuite si ce nom correspond à quelqu'un — et qui refuse quand deux
 * personnes se valent. Écrire ici une seconde recherche de contact ferait
 * exactement ce que le projet interdit : deux règles qui finissent par ne plus
 * dire la même chose, sur le sujet où se tromper ne se rattrape pas.
 *
 * CE QU'IL NE FAUT SURTOUT PAS RECONNAÎTRE, et c'est la moitié du travail :
 *
 * - « rappelle-moi de sortir les poubelles » n'est PAS un appel à quelqu'un.
 *   C'est même la tournure la plus fréquente de ses dictées. Le pronom qui
 *   suit le verbe tranche : « rappeler Jonathan » désigne une personne,
 *   « rappelle-moi de … » désigne la tâche elle-même.
 * - « appeler le plombier », « appeler la banque » : un métier ou une
 *   institution peut très bien être dans son répertoire. On propose donc, et
 *   c'est le répertoire qui répondra « je ne trouve personne à ce nom ».
 * - Un mot d'APPAREIL (« appeler mail », mal entendu) n'est jamais quelqu'un :
 *   `cibleTropCourante`, la même fonction que la commande vocale, l'écarte.
 *   C'est elle qui a été écrite après le vrai appel parti au répondeur le
 *   5 sept. 2026 à 21 h 07.
 */

export interface ActionSuggeree {
  /** Pour l'instant un seul genre. La forme reste ouverte : « écrire à X »
   * viendra du même endroit le jour où il le demandera. */
  genre: "appeler"
  /** Le nom TEL QU'IL L'A DIT. On ne le corrige pas, on ne le complète pas :
   * c'est le répertoire du téléphone qui sait, pas nous. */
  qui: string
}

/**
 * Les tournures qui désignent quelqu'un à joindre.
 *
 * `rappeler` est là, mais jamais suivi d'un pronom : c'est tout le piège.
 * L'accent est optionnel partout — ses dictées arrivent parfois sans.
 */
const APPELS = [
  /^(?:rappel(?:er|le)|appel(?:er|le)|t[ée]l[ée]phoner? [àa]|joindre)\s+(.+)$/i,
]

/**
 * Ce qui, juste après le verbe, prouve qu'il ne s'agit PAS d'une personne.
 *
 * DEUX FAMILLES, et il fallait les distinguer — c'est le contrôle
 * « rappeler que le rendez-vous chez le dentiste est mardi » qui l'a montré :
 * il rendait « que » comme un nom de personne.
 *
 * - Une CONJONCTION ouvre une subordonnée : « rappeler QUE le rendez-vous… »
 *   parle de la tâche, jamais de quelqu'un. Elle disqualifie toujours.
 * - Un PRONOM ne disqualifie que s'il EST tout le reste (« rappelle-le »), ou
 *   s'il ouvre un complément (« rappelle-moi DE sortir les poubelles »).
 *   Sinon c'est un article, et « appeler le plombier » désigne bien quelqu'un
 *   qui peut très bien être dans son répertoire — c'est au téléphone de le
 *   dire, pas à nous.
 */
const CONJONCTIONS = /^(?:que|qu'|qu’|si|quand|lorsque|pourquoi|comment)\b/i
const PRONOMS = /^(?:moi|toi|lui|nous|vous|leur|me|te|se|ça|ca|le|la|les|y|en)\b/i
const COMPLEMENT = /^(?:de|d'|d’|que|qu'|qu’|[àa])\b/i

/** Les amorces qu'il dicte avant la vraie tâche, et qu'il faut retirer avant
 * de chercher un verbe : « penser à rappeler Jonathan », « il faut que je
 * rappelle Jonathan ». Sans ça, le verbe n'est jamais en tête. */
const AMORCES =
  /^(?:penser? [àa]|pense [àa]|ne pas oublier de|il faut (?:que je|penser [àa]))\s+/i

/**
 * Ce qui suit le nom et n'en fait pas partie : « rappeler Jonathan pour le
 * devis » désigne Jonathan, pas « Jonathan pour le devis ».
 *
 * `le` et `la` N'Y SONT PAS, et c'est un contrôle qui l'a montré :
 * « Rappeler Jonathan le comptable » rendait « Jonathan ». Or l'apposition
 * est justement ce qui distingue deux Jonathan dans son répertoire — la
 * couper reviendrait à choisir à sa place, sur le seul sujet où se tromper ne
 * se rattrape pas. On passe donc ce qu'il a écrit, en entier.
 */
const SUITE = /\s+(?:pour|au sujet de|[àa] propos de|concernant|avant|apr[èe]s|vers)\s.*$/i

export function actionSuggeree(titre: string): ActionSuggeree | null {
  const propre = titre.trim().replace(AMORCES, "")

  for (const motif of APPELS) {
    const trouve = propre.match(motif)
    if (!trouve) continue

    const reste = trouve[1].trim()
    // « rappeler que … » : une subordonnée, jamais quelqu'un.
    if (CONJONCTIONS.test(reste)) return null
    const pronom = reste.match(PRONOMS)
    if (pronom) {
      const apres = reste.slice(pronom[0].length).trim()
      // « rappelle-le » (le pronom est tout le reste) ou « rappelle-moi de … »
      // (il ouvre un complément) : la tâche parle d'elle-même. Ailleurs c'est
      // un article, et ce qui suit est bien quelqu'un.
      if (apres === "" || COMPLEMENT.test(apres)) return null
    }

    const qui = reste
      .replace(SUITE, "")
      .replace(/[.,;:!?]+$/, "")
      .trim()
    if (!qui) return null
    // Un nom de dix mots n'est pas un nom : c'est une phrase où le verbe s'est
    // trouvé par hasard. Le répertoire n'y trouverait rien, et proposer un
    // bouton qui échoue est pire que ne rien proposer.
    if (qui.split(/\s+/).length > 4) return null
    // Le garde-fou du 5 sept. : un mot d'appareil n'est pas quelqu'un.
    if (cibleTropCourante(qui)) return null

    return { genre: "appeler", qui }
  }
  return null
}

/** Le libellé du bouton, dans la notification. Court : Android le tronque. */
export function libelleAction(a: ActionSuggeree): string {
  return a.genre === "appeler" ? "Appeler" : "Ouvrir"
}
