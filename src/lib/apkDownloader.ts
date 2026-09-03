import { registerPlugin } from "@capacitor/core"

interface ApkDownloaderPlugin {
  hasInstallPermission(): Promise<{ granted: boolean }>
  openInstallPermissionSettings(): Promise<void>
  downloadAndInstall(options: { url: string }): Promise<void>
}

/** Pont vers le plugin natif Android (android/.../ApkDownloaderPlugin.java).
 * N'existe que dans l'app empaquetée — un clic sur le lien externe (target
 * navigateur système) ne finalise pas le téléchargement de façon fiable. */
export const ApkDownloader = registerPlugin<ApkDownloaderPlugin>("ApkDownloader")
