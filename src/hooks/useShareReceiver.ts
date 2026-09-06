import { Capacitor } from "@capacitor/core"
import { useEffect } from "react"
import { toast } from "sonner"
import { ShareReceiver } from "@/lib/shareReceiverPlugin"
import { corpsDuDocument, rapprocher } from "@/lib/allerRetourIA"
import { lireQuestionEnAttente, oublierQuestionEnAttente } from "@/lib/questionEnAttente"
import { noterEcoute } from "@/lib/journalEcoute"
import { documentDuResume, documentNonLu, quoiFaireDuPartage, type Resume } from "@/lib/partageALire"
import { supabase } from "@/lib/supabase"

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
 *
 * TROISIÈME CAS DEPUIS LE 6 SEPT. (chantier 73f06a28) : un partage ordinaire
 * n'est plus seulement RANGÉ, il est LU. Un lien, un PDF, un texte long partent
 * chez `lire-document`, qui en rend l'essentiel — montants, dates, ce que ça
 * engage. Avant, un bail de vingt pages atterrissait entier dans Documents et
 * il fallait le lire soi-même, ce qui revenait à ne rien avoir fait.
 *
 * ET ON GARDE TOUJOURS CE QU'IL A PARTAGÉ, même quand la lecture échoue :
 * échouer à résumer ne doit jamais revenir à perdre ce qu'il nous a donné.
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

        // La raison est tracée : un rapprochement raté doit se lire, pas se
        // deviner — c'est exactement le genre de chose qui échoue en silence.
        noterEcoute("partage_recu", { rapproche: false, pourquoi: resultat.pourquoi })
        await lireEtRanger(resultat.texte, maintenant, saveTextDocument)
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

/**
 * Lit ce qui a été partagé, puis le range — et dit à chaque étape où on en est.
 *
 * TROIS ÉTATS VISIBLES, parce qu'une lecture prend quelques secondes et qu'un
 * écran qui ne dit rien pendant ce temps se lit comme « il ne s'est rien
 * passé » : on annonce qu'on lit, puis ce qu'on a compris, ou pourquoi on n'a
 * pas pu.
 */
async function lireEtRanger(
  brut: string,
  maintenant: Date,
  saveTextDocument: (filename: string, content: string) => Promise<void>,
) {
  const quoi = quoiFaireDuPartage(brut)

  if (quoi.type === "ranger") {
    await saveTextDocument(`Partagé le ${maintenant.toLocaleDateString("fr-FR")}`, quoi.texte)
    toast.success("Reçu de l'extérieur, enregistré dans Documents.")
    return
  }

  const attente = toast.loading(
    quoi.type === "lien" ? "Je vais lire ce lien…" : "Je lis ce que tu m'as envoyé…",
  )
  try {
    const { data, error } = await supabase.functions.invoke("lire-document", {
      body: quoi.type === "lien" ? { url: quoi.url } : { texte: quoi.texte },
    })
    // Une fonction qui répond « pas lisible » n'est pas une erreur : elle a une
    // raison à donner, et cette raison est écrite pour être lue par Raphaël.
    const pourquoi = error ? "je n'ai pas réussi à la joindre" : (data?.message ?? "")

    if (!error && data?.lisible && data.resume) {
      const doc = documentDuResume(data.resume as Resume, data.source ?? null, !!data.tronquee)
      await saveTextDocument(doc.titre, doc.corps)
      noterEcoute("partage_lu", { type: quoi.type, nature: (data.resume as Resume).nature })
      toast.success(doc.titre, {
        id: attente,
        description: (data.resume as Resume).essentiel,
      })
      return
    }

    // On garde quand même ce qu'il a partagé.
    const repli = documentNonLu(brut, pourquoi || "je n'ai rien trouvé à lire", maintenant)
    await saveTextDocument(repli.titre, repli.corps)
    noterEcoute("partage_non_lu", { type: quoi.type, pourquoi })
    toast.warning("Gardé sans être lu", { id: attente, description: pourquoi })
  } catch (err) {
    const repli = documentNonLu(brut, String(err), maintenant)
    await saveTextDocument(repli.titre, repli.corps)
    toast.warning("Gardé sans être lu", { id: attente })
  }
}
