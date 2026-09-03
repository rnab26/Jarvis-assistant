import { Capacitor } from "@capacitor/core"
import { useEffect } from "react"
import { toast } from "sonner"
import { ShareReceiver } from "@/lib/shareReceiverPlugin"

const isNative = Capacitor.isNativePlatform()

/**
 * Reçoit ce qui est partagé vers Jarvis depuis une autre app (menu
 * "Partager" d'Android — navigateur, WhatsApp, etc.) et l'enregistre
 * directement comme document, sans étape intermédiaire (demande
 * d'origine : "effort court", gratuit). Vérifié à l'ouverture et à
 * chaque retour au premier plan, car l'app peut déjà être ouverte quand
 * le partage arrive.
 */
export function useShareReceiver(saveTextDocument: (filename: string, content: string) => Promise<void>) {
  useEffect(() => {
    if (!isNative) return

    async function checkPendingShare() {
      try {
        const { text } = await ShareReceiver.getPendingShare()
        if (!text) return
        const filename = `Partagé le ${new Date().toLocaleDateString("fr-FR")}`
        await saveTextDocument(filename, text)
        toast.success("Reçu de l'extérieur, enregistré dans Documents.")
      } catch {
        // Un échec ici ne doit pas bloquer l'ouverture de l'app.
      }
    }

    checkPendingShare()

    function onVisible() {
      if (document.visibilityState === "visible") checkPendingShare()
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => document.removeEventListener("visibilitychange", onVisible)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
