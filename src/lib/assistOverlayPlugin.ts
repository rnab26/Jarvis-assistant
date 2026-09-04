import { registerPlugin } from "@capacitor/core"

interface AssistOverlayPlugin {
  estOverlay(): Promise<{ overlay: true }>
  fermer(): Promise<void>
}

/** Pont vers AssistOverlayActivity/AssistOverlayPlugin.java. N'existe que
 * dans la fenêtre ouverte par l'appui long — absent (l'appel échoue) dans
 * l'app normale, y compris sur le web : c'est justement ce qui permet de
 * savoir laquelle des deux fenêtres tourne. */
export const AssistOverlay = registerPlugin<AssistOverlayPlugin>("AssistOverlay")
