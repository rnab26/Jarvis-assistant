import { registerPlugin } from "@capacitor/core"

/**
 * La bulle Jarvis, posée par-dessus les autres applications.
 *
 * SA DEMANDE, 5 sept. 2026, quand je lui proposais de CHOISIR entre l'appui
 * long et la bulle : « oui et aussi l'option bulle flottante, les deux
 * doivent être disponibles tant que ce n'est pas fonctionnel à 100 %, et
 * simplement par possibilité de changer à tout moment. » Les deux coexistent
 * donc, et l'un ne remplace pas l'autre.
 *
 * L'ÉTAT NE SE DÉDUIT JAMAIS DU RÉGLAGE. L'autorisation « afficher par-dessus
 * les autres applications » se retire depuis Android sans que l'app en sache
 * rien, et le service peut avoir été arrêté par un appui long sur la bulle
 * elle-même. Un interrupteur allumé au-dessus d'une bulle absente serait un
 * mensonge de plus — on lit donc le système à chaque affichage.
 */

export interface EtatBulle {
  /** L'autorisation d'afficher par-dessus les autres applications. */
  autorisee: boolean
  /** La bulle est réellement à l'écran en ce moment. */
  active: boolean
}

interface BullePlugin {
  etat(): Promise<EtatBulle>
  /** Ouvre l'écran d'Android : cet accès ne s'obtient pas par une fenêtre. */
  demanderAutorisation(): Promise<void>
  demarrer(): Promise<void>
  arreter(): Promise<void>
}

export const Bulle = registerPlugin<BullePlugin>("Bulle")

/** Le réglage : la bulle doit-elle revenir au démarrage de l'app ? */
export const CLE_BULLE = "jarvis_bulle_flottante"

export function bulleVoulue(): boolean {
  try {
    return localStorage.getItem(CLE_BULLE) === "1"
  } catch {
    return false
  }
}

/**
 * Ce que l'écran doit afficher, et ce qu'il doit proposer.
 *
 * Trois situations bien distinctes, et les confondre donne un bouton mort :
 * l'autorisation manque (seul un écran d'Android peut la donner), elle est
 * là mais la bulle est rangée, ou tout est en place.
 */
export type SituationBulle = "hors_app" | "sans_autorisation" | "rangee" | "affichee"

export function situationBulle(
  disponible: boolean,
  etat: EtatBulle | null,
): SituationBulle {
  if (!disponible || !etat) return "hors_app"
  if (!etat.autorisee) return "sans_autorisation"
  return etat.active ? "affichee" : "rangee"
}

/** Ce qu'on dit sous l'interrupteur, selon la situation. */
export function phraseBulle(situation: SituationBulle): string {
  switch (situation) {
    case "hors_app":
      return "La bulle n'existe que dans l'application installée sur le téléphone."
    case "sans_autorisation":
      return "Android demande une autorisation à part pour afficher quelque chose par-dessus les autres applications. Elle ne se donne que depuis ses réglages."
    case "rangee":
      return "La bulle est rangée. Un appui long dessus la range aussi, sans venir ici."
    case "affichee":
      return "Un appui dessus ouvre Jarvis, un glissement la déplace, un appui long la range."
  }
}
