import { registerPlugin } from "@capacitor/core"

interface BulleEcoutePlugin {
  estBulle(): Promise<{ bulle: true }>
  fermer(): Promise<void>
}

/** Pont vers BulleEcouteActivity/BulleEcoutePlugin.java. N'existe que dans
 * la fenêtre invisible ouverte par un appui sur la bulle flottante —
 * absent (l'appel échoue) dans l'app normale et dans la fenêtre
 * d'assistance de l'appui long : c'est ce qui permet de savoir laquelle des
 * trois fenêtres tourne. Même principe que AssistOverlay
 * (src/lib/assistOverlayPlugin.ts), pour une fenêtre différente. */
export const BulleEcoute = registerPlugin<BulleEcoutePlugin>("BulleEcoute")
