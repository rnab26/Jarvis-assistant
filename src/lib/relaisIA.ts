/**
 * Ce qui se passe une fois la réponse d'une IA relayée récupérée par
 * Jarvis — via le partage Android ou « garde ça » (chantier 7d7967b2).
 *
 * D'OÙ ÇA VIENT. Chantier acad6f74, réponse de Raphaël le 5 sept. 2026 aux
 * trois sens possibles d'« intégrer les IA » : « dans les options de Jarvis
 * pouvoir choisir si l'IA répond ou si jarvis lis la reponse mais je pense
 * que de façon générale c'est plus logique que L'IA reprenne la main ».
 *
 * DEUX VALEURS, UN RÉGLAGE (pas une case en dur) :
 * - « L'IA répond » (par défaut) — Jarvis passe le relais et se tait. La
 *   réponse est rangée dans Documents, Raphaël la lit dans l'application qui
 *   a répondu.
 * - « Jarvis lit la réponse » — en plus de la ranger, Jarvis la lit à voix
 *   haute.
 *
 * Module PUR, comme `notificationsLues.ts` pour le même genre de choix.
 */

export const CLE_RELAIS_IA_LECTURE = "jarvis_ia_relais_lecture"

/** `null`/absent = pas encore choisi = comportement par défaut, celui que
 * Raphaël a dit préférer « de façon générale » : l'IA reprend la main. */
export function lectureVoulue(valeurBrute: string | null): boolean {
  return valeurBrute === "1"
}
