import { useCallback, useEffect, useRef, useState } from "react"
import { useRefreshOnForeground } from "@/hooks/useRefreshOnForeground"
import { errorMessage } from "@/lib/errorMessage"
import { withErrorToast } from "@/lib/notifyError"
import { supabase } from "@/lib/supabase"
import { withTimeout } from "@/lib/withTimeout"
import { cheminPhoto, corpsReponse } from "@/lib/decisions"
import { AUTEUR_RAPHAEL } from "@/lib/journalDestinataire"
import { compresserPhoto } from "@/lib/photoClient"
import type { DevLogEntry, DevLogKind, EtatAction, OptionDecision } from "@/types/database"

/** Réexporté : la constante vit dans `journalDestinataire`, qui doit rester
 * chargeable sans React pour les vérifications hors réseau. */
export { AUTEUR_RAPHAEL } from "@/lib/journalDestinataire"

const LIMITE = 60

/**
 * Journal de bord partagé : les sessions Claude Code qui travaillent en
 * parallèle sur ce repo s'y posent des questions, et Raphaël y répond ou y
 * donne des consignes depuis l'app.
 */
export function useDevLog(userId: string | undefined) {
  const [entries, setEntries] = useState<DevLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const latestRequest = useRef(0)

  const refresh = useCallback(async () => {
    if (!userId) {
      setEntries([])
      setError(null)
      setLoading(false)
      return
    }

    const request = ++latestRequest.current
    try {
      const { data, error: queryError } = await withTimeout(
        supabase
          .from("dev_log")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(LIMITE),
      )

      if (request !== latestRequest.current) return // réponse périmée
      if (queryError) throw queryError

      setEntries(data ?? [])
      setError(null)
    } catch (e) {
      if (request !== latestRequest.current) return
      setError(errorMessage(e))
    } finally {
      if (request === latestRequest.current) setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    refresh()
  }, [refresh])

  useRefreshOnForeground(refresh)

  async function addEntry(body: string, kind: DevLogKind = "info", itemId: string | null = null) {
    if (!userId) return
    await withErrorToast("Impossible d'écrire dans le journal", async () => {
      const { error: insertError } = await supabase.from("dev_log").insert({
        user_id: userId,
        item_id: itemId,
        author: AUTEUR_RAPHAEL,
        kind,
        body,
      })
      if (insertError) throw insertError
      await refresh()
    })
  }

  /**
   * Sa réponse à une question posée par une session — l'option choisie, ses
   * mots, et sa capture d'écran s'il en joint une.
   *
   * Elle s'écrit comme n'importe quelle réponse du journal (`kind` =
   * « reponse », rattachée au même chantier) : c'est ce que la carte du
   * chantier affiche déjà, et ce que le hook de démarrage injecte déjà. Rien
   * à décoder pour la session qui la lira — ni jointure, ni jsonb : ses mots
   * sont lisibles tels quels, des années après.
   *
   * La photo part AVANT l'écriture. Si l'envoi échoue, la réponse n'est pas
   * enregistrée — mieux vaut qu'il réessaie que de garder une réponse qui
   * renvoie vers une capture inexistante.
   */
  async function repondreAQuestion(
    question: DevLogEntry,
    option: OptionDecision | null,
    commentaire: string,
    photo: File | null,
  ) {
    if (!userId) return
    await withErrorToast("Impossible d'enregistrer ta réponse", async () => {
      let chemin: string | null = null
      if (photo) {
        const compressee = await compresserPhoto(photo)
        chemin = cheminPhoto(userId, crypto.randomUUID())
        const { error: envoiError } = await supabase.storage
          .from("cockpit")
          .upload(chemin, compressee, { contentType: "image/jpeg", upsert: false })
        if (envoiError) throw envoiError
      }

      const { error: insertError } = await supabase.from("dev_log").insert({
        user_id: userId,
        item_id: question.item_id,
        author: AUTEUR_RAPHAEL,
        kind: "reponse",
        body: corpsReponse(option, commentaire),
        photo_chemin: chemin,
      })
      if (insertError) throw insertError

      const { error: updateError } = await supabase
        .from("dev_log")
        .update({ answered_at: new Date().toISOString() })
        .eq("id", question.id)
      if (updateError) throw updateError
      await refresh()
    })
  }

  /**
   * Où il en est sur une ACTION de son côté.
   *
   * « Fait » referme la ligne — il n'y a plus rien à en dire. « Pas encore »
   * et « ça bloque » la laissent ouverte : c'est justement ce que les fiches
   * ne savaient pas porter, « il me demande de créer des clés, mais je ne peux
   * pas écrire si je l'ai fait, si ça bloque ».
   */
  async function changerEtatAction(id: string, etat: EtatAction) {
    await withErrorToast("Impossible d'enregistrer où tu en es", async () => {
      const { error: updateError } = await supabase
        .from("dev_log")
        .update({ etat, answered_at: etat === "fait" ? new Date().toISOString() : null })
        .eq("id", id)
      if (updateError) throw updateError
      await refresh()
    })
  }

  /** Une capture jointe : le bucket est privé, l'URL est signée à la demande. */
  async function urlPhoto(chemin: string): Promise<string | null> {
    const { data } = await supabase.storage.from("cockpit").createSignedUrl(chemin, 3600)
    return data?.signedUrl ?? null
  }

  /** Marque une question comme traitée, pour qu'elle sorte des points en attente. */
  async function markAnswered(id: string) {
    await withErrorToast("Impossible de marquer ce message comme traité", async () => {
      const { error: updateError } = await supabase
        .from("dev_log")
        .update({ answered_at: new Date().toISOString() })
        .eq("id", id)
      if (updateError) throw updateError
      await refresh()
    })
  }

  return {
    entries,
    loading,
    error,
    refresh,
    addEntry,
    markAnswered,
    repondreAQuestion,
    changerEtatAction,
    urlPhoto,
  }
}
