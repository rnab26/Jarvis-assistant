import { registerPlugin } from "@capacitor/core"

interface ShareReceiverPlugin {
  getPendingShare(): Promise<{ text: string | null }>
}

/** Pont vers le plugin natif Android (android/.../ShareReceiverPlugin.java).
 * N'existe que dans l'app empaquetée — inoffensif à appeler ailleurs, la
 * fonction est simplement absente. */
export const ShareReceiver = registerPlugin<ShareReceiverPlugin>("ShareReceiver")
