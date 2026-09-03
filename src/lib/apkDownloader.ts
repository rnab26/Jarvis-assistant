import { registerPlugin, type PluginListenerHandle } from "@capacitor/core"

/** recus/total en octets. total vaut -1 tant qu'Android ne le connaît pas
 * encore (début de réponse chunkée) — pas de pourcentage prétendu avant de
 * l'avoir vraiment. */
export interface ProgressionTelechargement {
  recus: number
  total: number
}

interface ApkDownloaderPlugin {
  hasInstallPermission(): Promise<{ granted: boolean }>
  openInstallPermissionSettings(): Promise<void>
  downloadAndInstall(options: { url: string }): Promise<void>
  addListener(
    eventName: "progression",
    listenerFunc: (data: ProgressionTelechargement) => void,
  ): Promise<PluginListenerHandle>
}

/** Pont vers le plugin natif Android (android/.../ApkDownloaderPlugin.java).
 * N'existe que dans l'app empaquetée — un clic sur le lien externe (target
 * navigateur système) ne finalise pas le téléchargement de façon fiable. */
export const ApkDownloader = registerPlugin<ApkDownloaderPlugin>("ApkDownloader")
