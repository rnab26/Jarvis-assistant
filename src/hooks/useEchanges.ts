import { useCallback, useEffect, useRef, useState } from "react"
import { useRefreshOnForeground } from "@/hooks/useRefreshOnForeground"
import { errorMessage } from "@/lib/errorMessage"
import { withErrorToast } from "@/lib/notifyError"
import { supabase } from "@/lib/supabase"
import { withTimeout } from "@/lib/withTimeout"
import type { Echange } from "@/types/database"

/**
 * Ce dont la carte « Vos conversations » a besoin. Nommé pour que le banc
 * d'essai (scripts/harness/memoire.tsx) puisse en fournir une version factice
 * et parcourir la vraie carte sans Supabase — même motif que NotificationsApi.
 */
export interface EchangesApi {
  echanges: Echange[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  oublier: (id: string) => Promise<void>
  toutOublier: () => Promise<void>
}

/**
 * Le mot-à-mot des conversations des sept derniers jours.
 *
 * Jarvis s'en sert pour répondre à « on avait parlé de quoi pour la villa
 * Dan ? » (chantier caa54df2) : il faut donc que Raphaël puisse voir ce qui
 * est gardé, et en effacer ce qu'il ne veut pas y laisser. Sans cet écran, la
 * seule façon de savoir ce que Jarvis peut ressortir serait de le lui
 * demander.
 *
 * La purge à sept jours est faite côté serveur, à chaque échange.
 */
export function useEchanges(userId: string | undefined): EchangesApi {
  const [echanges, setEchanges] = useState<Echange[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const latestRequest = useRef(0)

  const refresh = useCallback(async () => {
    if (!userId) {
      setEchanges([])
      setError(null)
      setLoading(false)
      return
    }

    const request = ++latestRequest.current
    try {
      const { data, error: queryError } = await withTimeout(
        supabase
          .from("echanges")
          .select("id, user_id, transcript, reponse, created_at")
          .order("created_at", { ascending: false })
          .limit(300),
      )
      if (request !== latestRequest.current) return
      if (queryError) throw queryError
      setEchanges(data ?? [])
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

  async function oublier(id: string) {
    await withErrorToast("Impossible d'effacer cet échange", async () => {
      const { error: e } = await supabase.from("echanges").delete().eq("id", id)
      if (e) throw e
      await refresh()
    })
  }

  /** Tout effacer : le contrôle qu'on attend d'un historique de conversation. */
  async function toutOublier() {
    await withErrorToast("Impossible d'effacer l'historique", async () => {
      if (!userId) return
      const { error: e } = await supabase.from("echanges").delete().eq("user_id", userId)
      if (e) throw e
      await refresh()
    })
  }

  return { echanges, loading, error, refresh, oublier, toutOublier }
}
