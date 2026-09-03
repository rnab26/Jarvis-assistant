import { useState } from "react"

const STORAGE_KEY = "jarvis_geofence_enabled"

/**
 * Préférence "rappels de lieu par géolocalisation réelle" (activation
 * manuelle, off par défaut — consomme de la batterie même optimisé) —
 * persistée en local, propre à cet appareil.
 */
export function useGeofenceSetting() {
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
