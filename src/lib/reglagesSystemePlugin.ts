import { registerPlugin } from "@capacitor/core"

/** Où en est Jarvis vis-à-vis du rôle « assistant numérique » d'Android. */
export interface EtatAssistant {
  /**
   * L'APK INSTALLÉE déclare-t-elle l'activité d'assistance ? Faux = Jarvis ne
   * peut pas apparaître dans la liste d'Android, et aucun réglage n'y changera
   * rien : c'est la coquille Android qui porte le manifeste, et la mise à jour
   * rapide ne remplace que l'interface.
   */
  candidat: boolean
  /** "actif" = Jarvis est l'assistant du téléphone ; "inconnu" avant
   * Android 10 ou si le système refuse de répondre. */
  role: "actif" | "inactif" | "inconnu"
}

interface ReglagesSystemePlugin {
  /** L'écran des notifications de Jarvis dans les réglages d'Android. */
  ouvrirNotifications(): Promise<void>
  /** La fiche de l'application : permissions, stockage, notifications. */
  ouvrirFicheApplication(): Promise<{ ecran: string }>
  /** Ce qu'Android pense de Jarvis comme assistant du téléphone. */
  etatAssistant(): Promise<EtatAssistant>
  /** L'écran où l'on choisit l'assistant numérique. `ecran` dit lequel s'est
   * ouvert : "assistant" (le bon), "applications" (la liste des applications
   * par défaut) ou "fiche" (la fiche de l'app, dernier recours). */
  ouvrirReglagesAssistant(): Promise<{ ecran: string }>
}

/**
 * Pont vers android/.../ReglagesSystemePlugin.java.
 *
 * Android ne montre la demande d'autorisation des notifications qu'une seule
 * fois : refusée, l'interrupteur reste bloqué et le seul recours est l'écran
 * système. Sans ce pont, il fallait dire à Raphaël d'aller le chercher
 * lui-même dans les réglages du téléphone — exactement le genre de
 * manipulation qu'on doit lui éviter.
 *
 * N'existe que dans l'app empaquetée. Chaque appel est à protéger : depuis
 * la mise à jour rapide, une interface récente peut tourner dans une APK
 * plus ancienne, où ce plugin n'existe pas encore.
 */
export const ReglagesSysteme = registerPlugin<ReglagesSystemePlugin>("ReglagesSysteme")
