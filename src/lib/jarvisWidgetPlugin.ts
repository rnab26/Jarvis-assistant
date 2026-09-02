import { registerPlugin } from "@capacitor/core"

interface JarvisWidgetPlugin {
  refresh(): Promise<void>
}

/** Pont vers le plugin natif Android (android/.../JarvisWidgetPlugin.java).
 * N'existe que dans l'app empaquetée — inoffensif à appeler ailleurs, la
 * fonction refresh() est simplement absente (voir updateWidgetSnapshot). */
export const JarvisWidget = registerPlugin<JarvisWidgetPlugin>("JarvisWidget")
