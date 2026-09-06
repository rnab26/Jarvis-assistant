import { registerPlugin, type PluginListenerHandle } from "@capacitor/core"

/** recus/total en octets. total vaut -1 tant qu'Android ne le connaît pas
 * encore (début de réponse chunkée) — pas de pourcentage prétendu avant de
 * l'avoir vraiment. */
export interface ProgressionTelechargement {
  recus: number
  total: number
  /** Android a mis le téléchargement en pause. Sans ce signal, le dernier
   * « 0.0 Mo reçus » restait affiché tel quel pendant dix minutes, et une
   * attente du Wi-Fi se lisait exactement comme un plantage. */
  enPause?: boolean
  /** Pourquoi, en clair : « en attente du Wi-Fi », « nouvel essai en cours ». */
  pourquoi?: string
}

/** Émis quand on abandonne DownloadManager pour télécharger nous-mêmes. */
export interface AvisRepli {
  pourquoi: string
}

interface ApkDownloaderPlugin {
  hasInstallPermission(): Promise<{ granted: boolean }>
  openInstallPermissionSettings(): Promise<void>
  downloadAndInstall(options: { url: string }): Promise<void>
  /** Le dernier recours : ouvrir le lien dans le navigateur du téléphone. Un
   * <a href download> ordinaire ne sort jamais de la WebView — Capacitor
   * l'intercepte. */
  ouvrirLienExterne(options: { url: string }): Promise<void>
  addListener(
    eventName: "progression",
    listenerFunc: (data: ProgressionTelechargement) => void,
  ): Promise<PluginListenerHandle>
  addListener(
    eventName: "repli",
    listenerFunc: (data: AvisRepli) => void,
  ): Promise<PluginListenerHandle>
}

/** Pont vers le plugin natif Android (android/.../ApkDownloaderPlugin.java).
 * N'existe que dans l'app empaquetée — un clic sur le lien externe (target
 * navigateur système) ne finalise pas le téléchargement de façon fiable. */
export const ApkDownloader = registerPlugin<ApkDownloaderPlugin>("ApkDownloader")
