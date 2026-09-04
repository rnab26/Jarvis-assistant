import { ecrireReglage } from "@/lib/reglages"

/**
 * « Mode conversation Live » : le cœur ouvre une conversation Gemini Live
 * (audio en continu, fin de tour et interruption gérées par Google) au lieu
 * du micro fait main. Prototype, désactivé par défaut — décision de Raphaël
 * du 4 sept. : les deux pistes avancent en parallèle, on mesure, on tranche.
 */
export const MODE_LIVE_KEY = "jarvis_mode_live"

export function lireModeLive(): boolean {
  try {
    return localStorage.getItem(MODE_LIVE_KEY) === "1"
  } catch {
    return false
  }
}

export function ecrireModeLive(actif: boolean) {
  ecrireReglage(MODE_LIVE_KEY, actif ? "1" : "0")
}
