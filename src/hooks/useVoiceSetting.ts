import { useState } from "react"

const STORAGE_KEY = "jarvis_voice_index"

/** Voix TTS choisie par l'utilisateur (index dans getVoices()) — persistée
 * en local, propre à cet appareil. null = voix par défaut du système. */
export function useVoiceSetting() {
  const [voiceIndex, setVoiceIndexState] = useState<number | null>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      return stored === null ? null : Number(stored)
    } catch {
      return null
    }
  })

  function setVoiceIndex(value: number | null) {
    setVoiceIndexState(value)
    try {
      if (value === null) {
        localStorage.removeItem(STORAGE_KEY)
      } else {
        localStorage.setItem(STORAGE_KEY, String(value))
      }
    } catch {
      // Stockage indisponible : la préférence reste active pour la session en cours seulement.
    }
  }

  return { voiceIndex, setVoiceIndex }
}
