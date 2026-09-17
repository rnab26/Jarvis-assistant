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

/**
 * Combien d'entrées on charge d'un coup.
 *
 * Ce plafond existait déjà, mais MUET : le 17 sept. 2026 il y avait 304
 * entrées au journal et l'écran en montrait 60, sans rien dire — ce qui se lit
 * exactement comme « il n'y a plus rien ». C'est la moitié « incohérence sur
 * la durée de consultation » de ce qu'il a signalé. Le nombre n'a pas changé ;
 * ce qui change, c'est que l'écran dit ce qu'il ne montre pas, et propose la
 * suite.
 */
export const PAR_PAGE = 60

/**
 * Journal de bord partagé : les sessions Claude Code qui travaillent en
 * parallèle sur ce repo s'y posent des questions, et Raphaël y répond ou y
 * donne des consignes depuis l'app.
 */
export function useDevLog(userId: string | undefined) {
  const [entries, setEntries] = useState<DevLogEntry[]>([])
  const [limite, setLimite] = useState(PAR_PAGE)
  /** Combien il y en a EN TOUT. `null` = on ne sait pas, et on se tait plutôt
   * que d'annoncer un nombre faux (le compte peut échouer alors que la liste
   * est arrivée). */
  const [total, setTotal] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const latestRequest = useRef(0)

  const refresh = useCallback(async () => {
    if (!userId) {
      setEntries([])
      setTotal(null)
      setError(null)
      setLoading(false)
      return
    }

    const request = ++latestRequest.current
    try {
      // `count: "exact"` plutôt qu'une seconde requête : le total et la page
      // doivent venir du MÊME instant, sinon « 60 sur 304 » peut annoncer un
      // total qui n'a jamais correspondu à ce qui est à l'écran.
      const { data, count, error: queryError } = await withTimeout(
        supabase
          .from("dev_log")
          .select("*", { count: "exact" })
          .order("created_at", { ascending: false })
          .limit(limite),
      )

      if (request !== latestRequest.current) return // réponse périmée
      if (queryError) throw queryError

      setEntries(data ?? [])
      setTotal(typeof count === "number" ? count : null)
      setError(null)
    } catch (e) {
      if (request !== latestRequest.current) return
      setError(errorMessage(e))
    } finally {
      if (request === latestRequest.current) setLoading(false)
    }
  }, [userId, limite])

  /** La page suivante. L'effet ci-dessous relit dès que la limite bouge. */
  const chargerPlus = useCallback(() => setLimite((l) => l + PAR_PAGE), [])

  useEffect(() => {
    refresh()
  }, [refresh])

  useRefreshOnForeground(refresh)

  async function addEntry(
    body: string,
    kind: DevLogKind = "info",
    itemId: string | null = null,
    /** L'entrée à laquelle celle-ci répond — c'est elle qui fait le fil
     * (migration 0047), pas `itemId`, qui ne dit que le chantier. */
    repondA: string | null = null,
  ) {
    if (!userId) return
    await withErrorToast("Impossible d'écrire dans le journal", async () => {
      const { error: insertError } = await supabase.from("dev_log").insert({
        user_id: userId,
        item_id: itemId,
        author: AUTEUR_RAPHAEL,
        kind,
        body,
        repond_a: repondA,
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
        repond_a: question.id,
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
    total,
    chargerPlus,
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
