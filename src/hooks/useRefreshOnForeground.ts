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
    // "visibilitychange" n'est pas garanti dans une WebView Capacitor selon
    // la façon dont Android reprend l'activité (retour depuis l'écran de
    // reconnaissance vocale, depuis l'installateur d'APK, depuis les
    // réglages système). "focus" et "pageshow" couvrent ces reprises-là ;
    // un rechargement de trop ne coûte rien, un rechargement manquant se
    // voit tout de suite.
    window.addEventListener("focus", run)
    window.addEventListener("pageshow", run)
    return () => {
      document.removeEventListener("visibilitychange", run)
      window.removeEventListener("online", run)
      window.removeEventListener("focus", run)
      window.removeEventListener("pageshow", run)
    }
  }, [refresh])
}
