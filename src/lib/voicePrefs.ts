import { ecrireReglage } from "@/lib/reglages"

/**
 * Réglages de la voix de Jarvis, propres à l'appareil.
 *
 * Stockés ici plutôt que passés de composant en composant : la synthèse est
 * appelée depuis le micro comme depuis les Paramètres, et les deux doivent
 * parler avec la même voix, la même vitesse et la même hauteur.
 */

export const VOICE_INDEX_KEY = "jarvis_voice_index"
export const VOICE_RATE_KEY = "jarvis_voice_rate"
export const VOICE_PITCH_KEY = "jarvis_voice_pitch"
export const VOICE_MUTED_KEY = "jarvis_voice_muted"
/**
 * Distinct de VOICE_MUTED_KEY : coupé, Jarvis ne dit plus RIEN, y compris les
 * questions de clarification. Ce réglage-ci ne coupe que l'ANNONCE DU
 * RÉSULTAT d'une action déjà exécutée (« Message envoyé. », « Tâche ajoutée. »,
 * « Je n'ai pas réussi… ») — jamais une question qui attend sa réponse. Le
 * texte reste affiché sous le cœur dans tous les cas (chantier d9bc1275,
 * 17 sept. 2026) : ce réglage ne retire jamais la seule preuve visible qu'une
 * action a réussi ou échoué, il retire seulement la voix qui la répète.
 */
export const VOICE_CONFIRMER_RESULTAT_KEY = "jarvis_voice_confirmer_resultat"

/** Un peu plus rapide que le rythme neutre : moins lent à l'usage répété. */
export const DEFAULT_RATE = 1.15
export const DEFAULT_PITCH = 1

export const RATE_MIN = 0.5
export const RATE_MAX = 2
export const PITCH_MIN = 0.5
export const PITCH_MAX = 2

export interface VoicePrefs {
  voiceIndex: number | null
  rate: number
  pitch: number
  /** Voix coupée : Jarvis répond alors par écrit seulement. */
  muted: boolean
  /** Annonce à voix haute le résultat (succès/échec) d'une action déjà
   * exécutée. Activé par défaut — c'est le comportement d'origine. */
  confirmerResultat: boolean
}

function readNumber(key: string, fallback: number, min: number, max: number) {
  try {
    const stored = localStorage.getItem(key)
    if (stored === null) return fallback
    const value = Number(stored)
    if (!Number.isFinite(value)) return fallback
    return Math.min(Math.max(value, min), max)
  } catch {
    return fallback
  }
}

export function readVoicePrefs(): VoicePrefs {
  let voiceIndex: number | null = null
  try {
    const stored = localStorage.getItem(VOICE_INDEX_KEY)
    voiceIndex = stored === null || stored === "" ? null : Number(stored)
    if (voiceIndex !== null && !Number.isInteger(voiceIndex)) voiceIndex = null
  } catch {
    voiceIndex = null
  }

  let muted = false
  try {
    muted = localStorage.getItem(VOICE_MUTED_KEY) === "1"
  } catch {
    muted = false
  }

  // Défaut à true (contrairement à muted) : une valeur absente ne doit pas
  // se lire comme "il a choisi de couper les confirmations" — seul un "0"
  // écrit explicitement le fait.
  let confirmerResultat = true
  try {
    confirmerResultat = localStorage.getItem(VOICE_CONFIRMER_RESULTAT_KEY) !== "0"
  } catch {
    confirmerResultat = true
  }

  return {
    voiceIndex,
    rate: readNumber(VOICE_RATE_KEY, DEFAULT_RATE, RATE_MIN, RATE_MAX),
    pitch: readNumber(VOICE_PITCH_KEY, DEFAULT_PITCH, PITCH_MIN, PITCH_MAX),
    muted,
    confirmerResultat,
  }
}

/** Écrit la préférence de coupure. Séparée de writeVoicePref, qui ne
 *  manipule que des nombres. */
export function writeVoiceMuted(muted: boolean) {
  ecrireReglage(VOICE_MUTED_KEY, muted ? "1" : "0")
}

/** Écrit la préférence d'annonce du résultat des actions (succès/échec). */
export function writeVoiceConfirmerResultat(confirmer: boolean) {
  ecrireReglage(VOICE_CONFIRMER_RESULTAT_KEY, confirmer ? "1" : "0")
}

export function writeVoicePref(key: string, value: number | null) {
  ecrireReglage(key, value === null ? null : String(value))
}
