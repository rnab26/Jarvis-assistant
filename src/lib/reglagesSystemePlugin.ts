import { registerPlugin } from "@capacitor/core"

interface ReglagesSystemePlugin {
  /** L'écran des notifications de Jarvis dans les réglages d'Android. */
  ouvrirNotifications(): Promise<void>
  /** La fiche de l'application : permissions, stockage, notifications. */
  ouvrirFicheApplication(): Promise<void>
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
