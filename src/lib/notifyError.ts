import { toast } from "sonner"
import { errorMessage } from "@/lib/errorMessage"

/**
 * Signale à l'utilisateur qu'une écriture a échoué, et laisse l'erreur
 * remonter pour que l'appelant décide de la suite (garder une fenêtre
 * ouverte, par exemple).
 *
 * Sans ça, une écriture qui échoue (réseau coupé, droits refusés) ne se
 * voyait nulle part : la fenêtre se fermait ou restait ouverte sans
 * explication, la case à cocher ne bougeait pas, et une commande vocale
 * n'aboutissait tout simplement pas — le Toaster de l'app n'était jamais
 * utilisé.
 */
export async function withErrorToast<T>(action: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (e) {
    toast.error(action, { description: errorMessage(e) })
    throw e
  }
}

/**
 * Pour les boutons qui déclenchent une écriture sans l'attendre : l'erreur a
 * déjà été signalée par un toast, on évite juste la promesse rejetée non gérée.
 */
export const alreadyNotified = () => {}
