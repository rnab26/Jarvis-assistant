import { useState } from "react"
import { useRelireApresRestauration } from "@/hooks/useReglagesSync"
import { ecrireReglage } from "@/lib/reglages"

const STORAGE_KEY = "jarvis_geofence_enabled"

function lire() {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1"
  } catch {
    return false
  }
}

/**
 * Préférence "rappels de lieu par géolocalisation réelle" (activation
 * manuelle, off par défaut — consomme de la batterie même optimisé) —
 * persistée en local, propre à cet appareil.
 */
export function useGeofenceSetting() {
  const [enabled, setEnabledState] = useState(lire)

  useRelireApresRestauration(() => setEnabledState(lire()))

  function setEnabled(value: boolean) {
    setEnabledState(value)
    ecrireReglage(STORAGE_KEY, value ? "1" : "0")
  }

  return { enabled, setEnabled }
}
