import { AUTEUR_RAPHAEL } from "@/hooks/useDevLog"
import type { DevLogEntry } from "@/types/database"

/**
 * À qui s'adresse un message du journal de bord.
 *
 * Le journal sert deux conversations différentes — les sessions Claude Code
 * entre elles, et les sessions avec Raphaël — et rien ne les distingue dans
 * le schéma. La convention suivie par toutes les sessions est d'ouvrir un
 * message adressé à une autre session par « Pour la session … ». On s'appuie
 * dessus plutôt que d'ajouter une colonne qu'il faudrait faire adopter par
 * toutes les sessions en parallèle.
 *
 * Cette règle décide de DEUX choses maintenant : le badge « questions en
 * attente » du cockpit, et le fait de faire sonner le téléphone. Elle vit
 * donc ici, une fois — deux copies auraient dérivé, et on se serait retrouvé
 * avec un badge qui compte ce qui ne sonne pas.
 */

function adresseeAUneSession(entry: DevLogEntry): boolean {
  return /^pour la session\b/i.test(entry.body.trim())
}

/** Une question posée à Raphaël, à laquelle personne n'a encore répondu. */
export function questionPourRaphael(entry: DevLogEntry): boolean {
  return entry.kind === "question" && !entry.answered_at && !adresseeAUneSession(entry)
}

/**
 * Ce qui mérite de le déranger : une question pour lui, ou une session
 * bloquée qui attend une décision. Ce qu'il a écrit lui-même n'en fait
 * évidemment pas partie.
 */
export function estPourRaphael(entry: DevLogEntry): boolean {
  if (entry.author === AUTEUR_RAPHAEL) return false
  if (entry.answered_at || adresseeAUneSession(entry)) return false
  return entry.kind === "question" || entry.kind === "blocage"
}
