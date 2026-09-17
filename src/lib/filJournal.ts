// Relatif avec extension : ce module est vérifié par
// `node --experimental-strip-types scripts/verifier-fil-journal.ts`, qui ne
// connaît pas l'alias « @/ » de Vite.
import { courtAuteur } from "./journalBord.ts"
import type { DevLogEntry } from "@/types/database"

/**
 * Reprendre une discussion dans le journal de bord, et savoir ce qu'on ne voit
 * pas.
 *
 * SES MOTS, dictés le 17 sept. 2026 à 07 h 57 : « Dans le cockpit dev :
 * journal de bord, incohérence sur la durée de consultation des conversations
 * et impossibilité de reprendre la discussion ».
 *
 * MESURÉ le même matin, sur sa base, et c'est ce qui rend la phrase limpide :
 *   — 304 entrées au journal, sur 14,5 jours ;
 *   — UNE SEULE portait un bouton « Répondre ». Il n'apparaissait que sur une
 *     question sans réponse (`kind === "question" && !answered_at`). Les 303
 *     autres — 208 notes d'information des sessions, 18 blocages, 42 réponses,
 *     30 entrées écrites par lui — n'offraient aucun moyen d'enchaîner ;
 *   — et l'écran n'en affichait que 60, sans un mot. 244 entrées coupées en
 *     silence, ce qui se lit exactement comme « il n'y a plus rien ».
 *
 * Pur : ni React, ni Supabase, ni réseau. C'est ici que vivent les décisions
 * qui peuvent être fausses sans que rien ne le signale.
 */

/**
 * Peut-on reprendre la discussion sur cette entrée ?
 *
 * OUI, sur tout. C'est le cœur de ce qu'il demande, et la tentation à écarter
 * est de remettre une condition « intelligente » : une note d'information est
 * précisément ce à quoi il veut pouvoir répondre — c'est par là que les
 * sessions lui parlent, et c'était 208 des 304 entrées.
 *
 * La fonction existe quand même plutôt qu'un `true` en dur : une entrée qu'on
 * vient d'écrire et qui n'a pas encore d'identifiant ne peut être citée par
 * personne, et le bouton mentirait.
 */
export function peutRepondre(entry: DevLogEntry): boolean {
  return Boolean(entry.id)
}

/**
 * Marquer traité en répondant n'a de sens que pour une QUESTION EN ATTENTE :
 * c'est ce drapeau qui la sort de la colonne « pour toi ».
 *
 * Répondre à une note d'information ne referme rien. Poser `answered_at`
 * dessus serait invisible aujourd'hui et faux demain — le jour où quelque
 * chose comptera les entrées traitées, il compterait des notes que personne
 * n'a jamais traitées.
 */
export function doitMarquerTraite(parent: DevLogEntry): boolean {
  return parent.kind === "question" && !parent.answered_at
}

/** L'entrée citée par celle-ci, si elle est chargée. */
export function parentDe(
  entry: DevLogEntry,
  parIdentifiant: Map<string, DevLogEntry>,
): DevLogEntry | null {
  if (!entry.repond_a) return null
  return parIdentifiant.get(entry.repond_a) ?? null
}

/** Assez pour reconnaître le message, pas assez pour le redire en entier. */
const EXTRAIT_MAX = 90

/**
 * « en réponse à melissa-identite : Le site est en ligne… »
 *
 * Coupé AU MOT : un fragment coupé au caractère près se termine n'importe où
 * et se lit plus mal que pas de citation du tout.
 *
 * `null` quand le parent n'est pas chargé — on ne prétend pas citer ce qu'on
 * n'a pas. Le cas arrive pour de bon : une réponse peut être visible alors que
 * la question qu'elle cite est au-delà de ce qui a été chargé.
 */
export function citationDuParent(parent: DevLogEntry | null): string | null {
  if (!parent) return null
  const propre = parent.body.replace(/\s+/g, " ").trim()
  if (!propre) return courtAuteur(parent.author)
  if (propre.length <= EXTRAIT_MAX) return `${courtAuteur(parent.author)} : ${propre}`
  const coupe = propre.slice(0, EXTRAIT_MAX)
  const espace = coupe.lastIndexOf(" ")
  return `${courtAuteur(parent.author)} : ${espace > 30 ? coupe.slice(0, espace) : coupe}…`
}

/**
 * Ce que l'écran NE MONTRE PAS, dit en clair.
 *
 * `null` quand tout est affiché : un compteur permanent « 12 sur 12 » est du
 * bruit, et du bruit permanent finit par cacher le jour où il dit autre chose.
 *
 * Le total peut manquer (la requête qui le compte a pu échouer alors que la
 * liste, elle, est arrivée) : on se tait plutôt que d'annoncer un nombre faux.
 */
export function phraseDeCoupure(affichees: number, total: number | null): string | null {
  if (total === null) return null
  if (total <= affichees) return null
  return `${affichees} entrées affichées sur ${total}`
}

/** Combien la prochaine page en apporterait, au plus. */
export function resteACharger(affichees: number, total: number | null, parPage: number): number {
  if (total === null) return 0
  return Math.max(0, Math.min(parPage, total - affichees))
}
