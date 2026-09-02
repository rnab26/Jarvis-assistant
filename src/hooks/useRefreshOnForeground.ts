import { useEffect } from "react"

/**
 * Relance `refresh` quand l'app revient au premier plan ou que le réseau
 * revient.
 *
 * Android suspend l'app en arrière-plan : au réveil les données sont périmées,
 * et surtout un chargement qui avait échoué faute de réseau n'était jamais
 * retenté — l'écran restait bloqué sur "Chargement...".
 */
export function useRefreshOnForeground(refresh: () => void) {
  useEffect(() => {
    function run() {
      if (document.visibilityState === "visible") refresh()
    }

    document.addEventListener("visibilitychange", run)
    window.addEventListener("online", run)
    return () => {
      document.removeEventListener("visibilitychange", run)
      window.removeEventListener("online", run)
    }
  }, [refresh])
}
