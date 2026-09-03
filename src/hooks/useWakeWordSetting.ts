import { useState } from "react"
import { useRelireApresRestauration } from "@/hooks/useReglagesSync"
import { ecrireReglage } from "@/lib/reglages"

const STORAGE_KEY = "jarvis_wake_word_enabled"

function lire() {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1"
  } catch {
    return false
  }
}

/**
 * Préférence "écoute du mot-clé Jarvis" (activation manuelle, off par
 * défaut) — persistée en local, propre à cet appareil/navigateur.
 */
export function useWakeWordSetting() {
  const [enabled, setEnabledState] = useState(lire)

  useRelireApresRestauration(() => setEnabledState(lire()))

  function setEnabled(value: boolean) {
    setEnabledState(value)
    ecrireReglage(STORAGE_KEY, value ? "1" : "0")
  }

  return { enabled, setEnabled }
}
