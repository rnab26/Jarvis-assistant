import { useState } from "react"

const STORAGE_KEY = "jarvis_wake_word_enabled"

/**
 * Préférence "écoute du mot-clé Jarvis" (activation manuelle, off par
 * défaut) — persistée en local, propre à cet appareil/navigateur.
 */
export function useWakeWordSetting() {
  const [enabled, setEnabledState] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === "1"
    } catch {
      return false
    }
  })

  function setEnabled(value: boolean) {
    setEnabledState(value)
    try {
      localStorage.setItem(STORAGE_KEY, value ? "1" : "0")
    } catch {
      // Stockage indisponible (navigation privée, etc.) : la préférence
      // reste active pour la session en cours seulement.
    }
  }

  return { enabled, setEnabled }
}
