import { useCallback, useEffect, useRef, useState } from "react"
import { useRealtimeRefresh } from "@/hooks/useRealtimeRefresh"
import { useRefreshOnForeground } from "@/hooks/useRefreshOnForeground"
import { errorMessage } from "@/lib/errorMessage"
import { withErrorToast } from "@/lib/notifyError"
import { supabase } from "@/lib/supabase"
import { withTimeout } from "@/lib/withTimeout"
import type { ErreurCategorie, ErreurStatut, JarvisErreur } from "@/types/database"

/**
 * Le registre des erreurs de Jarvis (migration 0019).
 *
 * Lecture et gestion seulement : l'écriture automatique passe par
 * `src/lib/erreurs.ts`, qui doit rester utilisable hors de React (le moteur
 * d'écoute et les couches de données ne sont pas des composants).
 *
 * L'empreinte n'est JAMAIS recalculée quand Raphaël retouche le titre ou la
 * catégorie : elle reste celle du signalement automatique, pour que la
 * prochaine occurrence de la même erreur vienne toujours se ranger sur cette
 * ligne-là plutôt que d'en créer une seconde à côté.
 */
export function useJarvisErreurs(userId: string | undefined) {
  const [erreurs, setErreurs] = useState<JarvisErreur[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const latestRequest = useRef(0)

  const refresh = useCallback(async () => {
    if (!userId) {
      setErreurs([])
      setError(null)
      setLoading(false)
      return
    }

    const request = ++latestRequest.current
    try {
      const { data, error: queryError } = await withTimeout(
        supabase.from("jarvis_erreurs").select("*").order("last_seen", { ascending: false }),
      )
      if (request !== latestRequest.current) return
      if (queryError) throw queryError
      setErreurs(data ?? [])
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
  useRealtimeRefresh("jarvis_erreurs", userId, refresh)

  /** Une erreur signalée à la main par Raphaël : celles-là sont les plus
   * précieuses (une erreur de compréhension ne se détecte pas toute seule) et
   * les plus faciles à perdre. */
  async function ajouterErreur(input: {
    categorie: ErreurCategorie
    titre: string
    detail: string | null
    contexte: string | null
    correction: string | null
  }) {
    await withErrorToast("Impossible d'enregistrer l'erreur", async () => {
      const { data, error } = await supabase.rpc("signaler_erreur", {
        p_categorie: input.categorie,
        p_titre: input.titre.trim(),
        p_detail: input.detail?.trim() || null,
        p_contexte: input.contexte?.trim() || null,
        p_source: "manuel",
      })
      if (error) throw error
      if (input.correction?.trim() && data) {
        const { error: e2 } = await supabase
          .from("jarvis_erreurs")
          .update({ correction: input.correction.trim(), updated_at: new Date().toISOString() })
          .eq("id", data as string)
        if (e2) throw e2
      }
      await refresh()
    })
  }

  async function modifierErreur(
    id: string,
    patch: Partial<Pick<JarvisErreur, "categorie" | "titre" | "detail" | "contexte" | "correction" | "statut" | "dev_item_id">>,
  ) {
    await withErrorToast("Impossible de modifier l'erreur", async () => {
      const { error } = await supabase
        .from("jarvis_erreurs")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", id)
      if (error) throw error
      await refresh()
    })
  }

  async function changerStatut(id: string, statut: ErreurStatut) {
    await modifierErreur(id, { statut })
  }

  async function supprimerErreur(id: string) {
    await withErrorToast("Impossible de supprimer l'erreur", async () => {
      const { error } = await supabase.from("jarvis_erreurs").delete().eq("id", id)
      if (error) throw error
      await refresh()
    })
  }

  return {
    erreurs,
    loading,
    error,
    refresh,
    ajouterErreur,
    modifierErreur,
    changerStatut,
    supprimerErreur,
  }
}
