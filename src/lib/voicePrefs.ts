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

  return {
    voiceIndex,
    rate: readNumber(VOICE_RATE_KEY, DEFAULT_RATE, RATE_MIN, RATE_MAX),
    pitch: readNumber(VOICE_PITCH_KEY, DEFAULT_PITCH, PITCH_MIN, PITCH_MAX),
  }
}

export function writeVoicePref(key: string, value: number | null) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, String(value))
  } catch {
    // Stockage indisponible : le réglage vaut pour la session en cours seulement.
  }
}
