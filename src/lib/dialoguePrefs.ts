import { ecrireReglage } from "@/lib/reglages"

/**
 * Rythme de la discussion avec Jarvis, propre à l'appareil.
 *
 * Deux réglages, et une seule source de vérité pour les deux endroits qui en
 * dépendent : le moteur d'écoute (`useSpeechRecognition`) et l'enchaînement
 * des répliques (`MicButton`).
 */

export const PAUSE_KEY = "jarvis_dialogue_pause_ms"
export const SUITE_KEY = "jarvis_dialogue_suite_ms"

/** Silence toléré en pleine phrase. Assez long pour respirer ou chercher un
 * mot, assez court pour que Jarvis ne semble pas lent à répondre. */
export const DEFAULT_PAUSE_MS = 2000
export const PAUSE_MIN_MS = 600
export const PAUSE_MAX_MS = 6000

/** Temps pendant lequel le micro reste ouvert après que Jarvis a répondu,
 * pour enchaîner sans retoucher le bouton. 0 = désactivé. */
export const DEFAULT_SUITE_MS = 5000
export const SUITE_MIN_MS = 0
export const SUITE_MAX_MS = 15000

/** Temps laissé pour commencer à parler après avoir touché le micro. */
export const PREMIER_MOT_MS = 12000
/** Garde-fou absolu sur la durée d'un tour de parole. */
export const MAX_TOUR_MS = 180000

export interface DialoguePrefs {
  pauseMs: number
  suiteMs: number
}

function lireNombre(key: string, defaut: number, min: number, max: number) {
  try {
    const stocke = localStorage.getItem(key)
    if (stocke === null) return defaut
    const valeur = Number(stocke)
    if (!Number.isFinite(valeur)) return defaut
    return Math.min(Math.max(valeur, min), max)
  } catch {
    return defaut
  }
}

export function readDialoguePrefs(): DialoguePrefs {
  return {
    pauseMs: lireNombre(PAUSE_KEY, DEFAULT_PAUSE_MS, PAUSE_MIN_MS, PAUSE_MAX_MS),
    suiteMs: lireNombre(SUITE_KEY, DEFAULT_SUITE_MS, SUITE_MIN_MS, SUITE_MAX_MS),
  }
}

export function writeDialoguePref(key: string, valeur: number) {
  ecrireReglage(key, String(valeur))
}
