import { useEffect } from "react"
import { AnnonceNative } from "@/lib/annonceAppFermee"
import type { PrefsNotifications } from "@/lib/notifications/prefs"

/**
 * Garde le service natif d'annonce (chantier 23ee3735) informé des
 * préférences dont sa décision a besoin — voix coupée, heures de silence.
 *
 * Poussé à CHAQUE changement, que le service tourne ou non : c'est sans
 * effet s'il est arrêté (le plugin écrit juste des SharedPreferences), et ça
 * évite d'avoir à se souvenir de rebrancher ce fil le jour où quelqu'un
 * change ces réglages ailleurs.
 */
export function useAnnonceAppFermee(prefs: PrefsNotifications, voixCoupee: boolean) {
  useEffect(() => {
    AnnonceNative.ecrirePrefs({
      direAVoixHaute: prefs.direAVoixHaute,
      voixCoupee,
      silenceNuit: prefs.silenceNuit,
      silenceDebut: prefs.silenceDebut,
      silenceFin: prefs.silenceFin,
    }).catch(() => {
      // Hors de l'app, ou APK antérieure à ce plugin : rien à faire de plus.
    })
  }, [prefs.direAVoixHaute, voixCoupee, prefs.silenceNuit, prefs.silenceDebut, prefs.silenceFin])
}
