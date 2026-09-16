/**
 * Redire une dictée coupée ne doit pas créer une seconde ligne.
 *
 * SA PLAINTE (chantier 7b2c99e2, 15 sept. 2026) : « difficile de boucler
 * l'ajout d'une tâche sans avoir a faire des retouches manuelles ».
 *
 * MESURÉ SUR SES 298 VRAIES DICTÉES (`echanges`), pas supposé. Six paires
 * consécutives où la SECONDE contient la première mot pour mot, et où elle
 * ajoute quelque chose :
 *
 *     2,1 s   « appeler Mel ma femme »          → « … à 23h19 »
 *     3,3 s   « lance la musique de Booba »     → « … DKR »
 *     3,5 s   « Mets-moi un rappel … Ducamp »   → « … échéance à 15h »
 *     4,6 s   « envoyer un message à ma femme » → « … lui disant que tu l'aimes »
 *     6,9 s   « vidéo sur YouTube »             → « … qui parle de motivation »
 *    23,0 s   « Itinéraire de Pierre Amikay »   → « … avec Waze »
 *
 * **Les six sont le MÊME phénomène, et il n'y a aucun faux positif.** Le
 * service de reconnaissance rend un résultat final trop tôt ; il redit sa
 * phrase en la complétant. Ce n'est pas une seconde demande.
 *
 * ON COMPLÈTE, ON NE REFUSE PAS. C'est le point à ne pas défaire :
 * `deciderDoublonTache` (15 sept.) voit bien que les deux titres se
 * ressemblent et refuse le second — mais le second porte l'information EN
 * PLUS, l'échéance à 15 h. Refuser, c'est perdre ce qu'il vient d'ajouter,
 * et le renvoyer à la retouche manuelle dont il se plaint. Le reprendre pour
 * COMPLÉTER la même tâche est la seule issue qui ne perd rien.
 *
 * LA RELATION DE PRÉFIXE EST TOUT LE GARDE-FOU. Deux demandes différentes ne
 * commencent pas l'une par l'autre, mot pour mot. Une simple ressemblance ne
 * suffirait pas : « rappeler Dan » et « rappeler Mel » se ressemblent
 * beaucoup et ne sont pas la même demande.
 *
 * Module PUR. Vérifié par scripts/verifier-reprise-dictee.ts.
 */

/**
 * Au-delà, ce n'est plus une phrase qu'on redit, c'est une nouvelle demande.
 *
 * TRENTE SECONDES, ET C'EST MESURÉ : la plus tardive de ses six reprises
 * réelles est à 23,0 s (« Itinéraire … avec Waze »), les cinq autres sous
 * 7 s. Sur les 298 dictées, aucune paire en relation de préfixe n'est une
 * vraie seconde demande — ni dans cette fenêtre, ni au-delà. Le seuil n'est
 * donc pas ce qui protège : c'est le préfixe. Il ne fait qu'éviter de
 * rattacher une phrase à un tour oublié depuis longtemps.
 *
 * Constante mesurée dans un module pur, comme `FENETRE_COMPLETION_MS` ou les
 * 90 s de `confirmationEnvoi.ts` — pas un réglage : « la fenêtre de reprise
 * d'une dictée » n'est pas une préférence, c'est une propriété du service de
 * reconnaissance vocale.
 */
export const FENETRE_REPRISE_MS = 30_000

/** Le tour précédent, réduit à ce qui sert ici. */
export interface TourPrecedent {
  transcript: string
  /** Millisecondes epoch. */
  at: number
}

function aplatir(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * En dessous, un « préfixe » ne veut rien dire.
 *
 * « mets » est le début de « mets la musique » comme de « mets une tâche ».
 * Ses six reprises réelles font toutes plus de quinze caractères une fois
 * aplaties — la plus courte, « vidéo sur YouTube », en fait 16.
 */
const LONGUEUR_MINIMUM = 12

/**
 * Cette phrase est-elle la précédente, redite et complétée ?
 *
 * On exige que la phrase précédente soit un préfixe de la nouvelle **sur une
 * frontière de mot** : sans ça, « appeler Dan » serait un préfixe de
 * « appeler Daniel Nakache », qui est une AUTRE personne.
 */
export function estUneReprise(
  precedent: TourPrecedent | null,
  courante: string,
  maintenant: number,
): boolean {
  if (!precedent) return false
  if (maintenant - precedent.at > FENETRE_REPRISE_MS) return false
  if (maintenant < precedent.at) return false

  const avant = aplatir(precedent.transcript)
  const apres = aplatir(courante)
  if (avant.length < LONGUEUR_MINIMUM) return false
  // Redire À L'IDENTIQUE n'est pas une reprise : c'est une demande refaite
  // parce qu'il croit que rien n'a pris, et `deciderDoublonTache` s'en
  // occupe déjà. Ici on ne traite que la phrase qui AJOUTE quelque chose.
  if (apres.length <= avant.length) return false
  if (!apres.startsWith(avant)) return false
  // La frontière de mot : « appeler dan » ne reprend pas « appeler daniel ».
  return apres[avant.length] === " "
}

/** Ce qu'on sait de la dernière ligne créée, réduit à ce qui sert ici. */
export interface CreationRecente {
  vers: string
  id?: string
  quand: number
}

/** La forme minimale d'une action, pour rester indépendant de voiceActions. */
interface ActionAjoutTache {
  action: string
  title?: string
  notes?: string | null
  due_date?: string | null
  due_time?: string | null
  category_id?: string | null
  [clef: string]: unknown
}

/**
 * Transforme la création en COMPLÉTION de la ligne qu'il vient de dicter.
 *
 * Rend `null` quand il n'y a rien à transformer — pas de tâche récente, pas
 * d'identifiant (dictée partie dans la file hors ligne), ou aucune création
 * dans le lot. L'appelant garde alors les actions telles quelles : ne rien
 * faire est toujours l'issue sûre.
 *
 * ON N'ÉCRASE JAMAIS AVEC DU VIDE. La seconde dictée redit sa phrase et
 * l'allonge, donc elle apporte au moins autant que la première — mais le
 * modèle peut très bien ne pas reposer un champ qu'il avait déduit au tour
 * d'avant (la catégorie, les notes). Écrire `null` par-dessus effacerait ce
 * qui était juste : on ne transmet que ce qui est renseigné.
 */
export function completerPlutotQueCreer<T extends { action: string }>(
  actions: T[],
  creation: CreationRecente | null,
  maintenant: number,
): T[] | null {
  if (!creation || creation.vers !== "tache" || !creation.id) return null
  if (maintenant - creation.quand > FENETRE_REPRISE_MS) return null
  if (!actions.some((a) => a.action === "add_task")) return null

  const id = creation.id
  return actions.map((a) => {
    if (a.action !== "add_task") return a
    const ajout = a as unknown as ActionAjoutTache
    const changes: Record<string, unknown> = {}
    if (ajout.title) changes.title = ajout.title
    if (ajout.notes) changes.notes = ajout.notes
    if (ajout.due_date) changes.due_date = ajout.due_date
    if (ajout.due_time) changes.due_time = ajout.due_time
    if (ajout.category_id) changes.category_id = ajout.category_id
    return { action: "update_task", task_id: id, changes } as unknown as T
  })
}
