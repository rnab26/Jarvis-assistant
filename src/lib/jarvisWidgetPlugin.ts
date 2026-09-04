import { registerPlugin } from "@capacitor/core"

interface JarvisWidgetPlugin {
  refresh(): Promise<void>
  getPendingListen(): Promise<{ demarrer: boolean }>
  /** Recopie le cœur dans un fichier que les widgets savent lire. `null`
   * revient au réacteur livré dans l'APK. */
  setCoreImage(options: { dataUrl: string | null }): Promise<void>
}

/** Pont vers le plugin natif Android (android/.../JarvisWidgetPlugin.java).
 * N'existe que dans l'app empaquetée — inoffensif à appeler ailleurs, la
 * fonction refresh() est simplement absente (voir updateWidgetSnapshot). */
export const JarvisWidget = registerPlugin<JarvisWidgetPlugin>("JarvisWidget")

/**
 * Pousse le cœur vers les widgets d'écran d'accueil.
 *
 * Ils tournent hors du WebView : l'image en localStorage leur est invisible,
 * il faut la leur recopier en fichier. Silencieux hors de l'app empaquetée —
 * sur le web il n'y a pas de widget, et l'absence du plugin n'est pas une
 * erreur à remonter à Raphaël.
 */
export async function pousserCoeurVersWidget(dataUrl: string | null) {
  try {
    await JarvisWidget.setCoreImage({ dataUrl })
  } catch {
    // Pas d'app native ici : rien à faire.
  }
}
