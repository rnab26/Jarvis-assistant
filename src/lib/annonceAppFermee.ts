import { registerPlugin } from "@capacitor/core"
import { ecrireReglage } from "@/lib/reglages"

/**
 * Parler à voix haute même quand l'app est fermée (chantier 23ee3735).
 *
 * SA RÉPONSE, 5 sept. 2026 : « Oui, avec un interrupteur pour la couper. »
 * Il accepte donc la notification permanente « Jarvis » en barre d'état, à
 * la condition de pouvoir l'éteindre depuis Paramètres sans réinstaller.
 *
 * DÉCISION D'ARCHITECTURE, posée via scripts/demander.sh et tranchée par
 * Raphaël le 7 sept. au soir : un service au premier plan seul NE SUFFIT PAS
 * — si l'app est balayée hors des applications récentes, sa fenêtre (et donc
 * l'écouteur JS `localNotificationReceived` qui décide de parler,
 * src/hooks/useNotifications.ts) est détruite quand même. Le chemin qui
 * marche vraiment passe par JarvisNotificationListenerService (déjà accordé),
 * qui reçoit chaque notification au moment RÉEL où Android l'affiche, que la
 * WebView tourne ou non. Ça veut dire PORTER une petite règle (les heures de
 * silence, `dansLaPlageSilencieuse` dans notifications/plan.ts) en Java, en
 * plus du TypeScript — DUPLIQUÉ, sciemment, avec un contrôle qui compare les
 * deux implémentations sur les mêmes cas (scripts/verifier-annonce-native.ts)
 * plutôt que l'unicité habituelle du code : c'est la vraie garantie ici.
 *
 * CE QUE LE NATIF NE DÉCIDE PAS TOUT SEUL : il ne lit JAMAIS le contenu d'une
 * notification qui ne vient pas de notre propre paquet — c'est la même règle
 * que JarvisNotificationListenerService applique déjà aux autres apps.
 */

export interface EtatAnnonceNative {
  /** Le service tourne réellement, lu au système — jamais déduit du réglage. */
  active: boolean
}

interface AnnonceNativePlugin {
  etat(): Promise<EtatAnnonceNative>
  demarrer(): Promise<void>
  arreter(): Promise<void>
  /** Pousse les préférences dont la décision native a besoin — appelé à
   * chaque changement, et une fois au démarrage. */
  ecrirePrefs(options: {
    direAVoixHaute: boolean
    voixCoupee: boolean
    silenceNuit: boolean
    silenceDebut: string
    silenceFin: string
  }): Promise<void>
}

export const AnnonceNative = registerPlugin<AnnonceNativePlugin>("AnnonceNative")

export const CLE_ANNONCE_APP_FERMEE = "jarvis_annonce_app_fermee"

export function annonceAppFermeeVoulue(): boolean {
  try {
    return localStorage.getItem(CLE_ANNONCE_APP_FERMEE) === "1"
  } catch {
    return false
  }
}

export function ecrireAnnonceAppFermeeVoulue(actif: boolean) {
  ecrireReglage(CLE_ANNONCE_APP_FERMEE, actif ? "1" : "0")
}
