import { Capacitor } from "@capacitor/core"
import { useEffect } from "react"
import { toast } from "sonner"
import { ShareReceiver } from "@/lib/shareReceiverPlugin"
import { corpsDuDocument, rapprocher } from "@/lib/allerRetourIA"
import { lireQuestionEnAttente, oublierQuestionEnAttente } from "@/lib/questionEnAttente"
import { noterEcoute } from "@/lib/journalEcoute"

const isNative = Capacitor.isNativePlatform()

/**
 * Reçoit ce qui est partagé vers Jarvis depuis une autre app (menu
 * « Partager » d'Android). Vérifié à l'ouverture et à chaque retour au premier
 * plan, car l'app peut déjà être ouverte quand le partage arrive.
 *
 * DEUX CAS, et c'est la nouveauté du 5 sept. 2026 :
 *
 * — Si Jarvis vient d'envoyer une question à une IA installée (Perplexity,
 *   ChatGPT…), le texte partagé est sa RÉPONSE : elle est enregistrée avec la
 *   question qui l'a provoquée et le nom de l'app. C'est l'aller-retour que
 *   Raphaël demandait, sans payer d'API — le téléphone fait le lien, pas un
 *   abonnement.
 * — Sinon, partage ordinaire : document, comme avant. Ce chemin ne change pas.
 *
 * La décision elle-même vit dans `src/lib/allerRetourIA.ts`, pure et vérifiée
 * hors ligne : un mauvais rapprochement rangerait une réponse sous une
 * question qui n'est pas la sienne, sans que rien ne le signale.
 */
export function useShareReceiver(saveTextDocument: (filename: string, content: string) => Promise<void>) {
  useEffect(() => {
    if (!isNative) return

    async function checkPendingShare() {
      try {
        const { text } = await ShareReceiver.getPendingShare()
        if (!text) return

        const maintenant = new Date()
        const resultat = rapprocher(text, lireQuestionEnAttente(), maintenant)

        if (resultat.type === "reponse") {
          // Une question n'attend qu'une réponse : la suivante repartirait
          // sinon se ranger sous la même, des heures plus tard.
          oublierQuestionEnAttente()
          await saveTextDocument(resultat.titre, corpsDuDocument(resultat, maintenant))
          noterEcoute("ia_reponse_recue", {
            app: resultat.app,
            longueur: resultat.reponse.length,
          })
          toast.success(`Réponse de ${resultat.app} gardée`, {
            description: "Elle est dans Documents, avec ta question.",
          })
          return
        }

        const nom = `Partagé le ${maintenant.toLocaleDateString("fr-FR")}`
        await saveTextDocument(nom, resultat.texte)
        // La raison est tracée : un rapprochement raté doit se lire, pas se
        // deviner — c'est exactement le genre de chose qui échoue en silence.
        noterEcoute("partage_recu", { rapproche: false, pourquoi: resultat.pourquoi })
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
