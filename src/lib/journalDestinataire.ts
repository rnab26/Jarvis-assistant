import type { DevLogEntry } from "@/types/database"

/**
 * Ce que Raphaël écrit depuis l'app, par opposition aux sessions Claude Code.
 *
 * Déclaré ICI et pas dans `useDevLog` : ce module est lu par
 * `src/lib/decisions.ts`, qui doit rester chargeable sans React pour sa
 * vérification hors réseau. `useDevLog` le réexporte, les appelants existants
 * n'ont rien à changer.
 */
export const AUTEUR_RAPHAEL = "Raphaël"

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
 * Ce qui l'attend, LUI : une question à trancher ou une action de son côté.
 *
 * C'est ce que l'écran « Ce qui attend ta décision » affiche et ce que « Où
 * j'en suis » compte dans sa colonne « pour toi ». La règle vit ici avec les
 * autres, et pas dans chacun des deux : une question qu'un écran compte et que
 * l'autre ignore est précisément ce qui lui a fait répondre deux fois.
 *
 * Une question qu'une session pose à une AUTRE session n'en fait pas partie —
 * même convention que le badge du journal, « Pour la session … ».
 */
export function enAttenteDeRaphael(entry: DevLogEntry): boolean {
  return (
    (entry.kind === "question" || entry.kind === "action") &&
    !entry.answered_at &&
    !adresseeAUneSession(entry)
  )
}

/**
 * Ce qui mérite de le déranger : une question pour lui, ou une session
 * bloquée qui attend une décision. Ce qu'il a écrit lui-même n'en fait
 * évidemment pas partie.
 */
export function estPourRaphael(entry: DevLogEntry): boolean {
  if (entry.author === AUTEUR_RAPHAEL) return false
  if (entry.answered_at || adresseeAUneSession(entry)) return false
  // « action » comprise : une clé qu'il doit déposer bloque douze chantiers,
  // et personne d'autre que lui ne peut la déposer.
  return entry.kind === "question" || entry.kind === "blocage" || entry.kind === "action"
}
